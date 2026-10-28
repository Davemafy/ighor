import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Task, Event } from "./contracts";
import { TaskSchema } from "./contracts";
import type { TaskStore } from "../data/store";
import type { ModelProvider, CulturalProvider } from "../tools/interfaces";
import type { ResearchProvider, ResearchResult, ResearchSource } from "../tools/live-research";
import type { GooglePlacesProvider } from "../tools/google-maps";
import type { BrowserbaseObserver } from "../tools/browserbase-observer";
import { withToolDeadline } from "./execution";
import { createAgentToolRegistry, type AgentToolContext } from "./agent-tool-registry";

export interface UnifiedAgentInput {
  task: Task;
  owner: string;
  store: TaskStore;
  goal: string;
  model: ModelProvider;
  research: ResearchProvider;
  cultural?: CulturalProvider;
  places?: Pick<GooglePlacesProvider, "search">;
  browser?: Pick<BrowserbaseObserver, "observe">;
  send?: (event: Event) => void;
  trace: (action: string, outcome: string, requests?: number, evidenceIds?: string[]) => void;
}

/** Observe → select validated tool → execute → checkpoint → observe, across
 * web, Qloo, Places and internal artifacts in one existing Task record. */
export async function runUnifiedAgent(input: UnifiedAgentInput): Promise<ResearchResult> {
  const { task, store, owner, model, trace } = input;
  if (!model.chooseAgentAction) {
    return { status: "blocked", sources: [], requests: 0, warning: "Configured model cannot select agent tools." };
  }
  const clamp = (name: string, fallback: number, max: number) => {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= 1 ? Math.min(max, value) : fallback;
  };
  const maxSteps = clamp("IGOR_AGENT_MAX_STEPS", 4, 12);
  const maxRequests = clamp("IGOR_AGENT_MAX_REQUESTS", 8, 40);
  const runId = randomUUID();
  const now = () => new Date().toISOString();
  const sources: ResearchSource[] = [];
  const ctx: AgentToolContext = {
    task, research: input.research, cultural: input.cultural,
    places: input.places, browser: input.browser, sources, runId,
  };
  const tools = createAgentToolRegistry(ctx);
  if (task.agentRun) {
    const previous = task.agentRun;
    const finalStatus = ["completed", "partially_completed", "failed", "interrupted", "cancelled"]
      .includes(previous.status) ? previous.status : "interrupted";
    const savedArtifactIds = task.artifacts
      .filter((artifact) => artifact.id.startsWith(`agent-doc-${previous.id}`))
      .slice(-12)
      .map((artifact) => artifact.id);
    task.agentRunHistory = [
      ...(task.agentRunHistory ?? []),
      {
        id: previous.id,
        goal: previous.goal,
        status: finalStatus as typeof previous.status,
        startedAt: previous.startedAt,
        archivedAt: now(),
        requests: previous.requests,
        modelSteps: previous.modelSteps,
        toolNames: previous.steps.map((step) => step.tool),
        sourceCount: previous.sources.length,
        savedArtifactIds,
      },
    ].slice(-12);
  }
  task.agentRun = {
    id: runId, goal: input.goal.slice(0,3000), status: "created",
    startedAt: now(), updatedAt: now(), maxSteps, maxRequests,
    requests: 0, modelSteps: 0,
    usage: { modelCalls: 0, providerRequests: 0, modelTokens: null, estimatedCostUsd: null },
    steps: [], sources: [], warnings: [],
  };
  const persist = () => {
    const expected = task.brief.version;
    task.brief.version++;
    task.agentRun!.updatedAt = now();
    if (task.agentRun!.usage) {
      task.agentRun!.usage.modelCalls = task.agentRun!.modelSteps;
      task.agentRun!.usage.providerRequests = task.agentRun!.requests;
    }
    TaskSchema.parse(task);
    // A newer user correction wins over any late external observation.
    store.save(task, expected, owner);
    input.send?.({ type: "state", task: structuredClone(task) });
  };
  const attempted = new Set<string>();
  let modelFinished = false;
  task.agentRun.status = "reasoning";
  persist();

  for (let index = 0; index < maxSteps; index++) {
    const run = task.agentRun;
    if (!run || run.requests >= maxRequests) {
      if (run) run.warnings.push("Paid request limit reached.");
      break;
    }
    const available = tools.filter((t) => t.available &&
      (t.permission === "read" || t.permission === "internal"));
    let selection: Awaited<ReturnType<NonNullable<ModelProvider["chooseAgentAction"]>>>;
    try {
      run.modelSteps++;
      selection = await withToolDeadline(
        model.chooseAgentAction(input.goal, available.map((t) => ({
          name: t.name, description: t.description, permission: t.permission,
        })), run.steps.map((s) => ({ tool: s.tool, status: s.status, summary: s.summary })),
        structuredClone(task)), 18000,
      );
    } catch {
      run.warnings.push("Agent decision provider failed; completed observations are preserved.");
      trace("agent.decision.error", "Model could not produce an authorized next action.");
      break;
    }
    const selected = tools.find((t) => t.name === selection.name && t.available);
    if (!selected) {
      run.warnings.push("Model proposed an unavailable tool.");
      trace("agent.action.blocked", "Unavailable tool was rejected.");
      break;
    }
    if (selected.name === "agent.finish") {
      modelFinished = true;
      trace("agent.finish", "Agent ended tool use after reviewing observed results.");
      break;
    }

    let args: unknown;
    try {
      args = selected.schema.parse(selection.arguments);
    } catch {
      run.warnings.push(`Invalid arguments for ${selected.name}`);
      trace("agent.action.blocked", "Tool argument schema rejected the proposal.");
      break;
    }
    const fingerprint = selected.name + ":" + JSON.stringify(args);
    if (attempted.has(fingerprint)) {
      run.warnings.push("Repeated tool invocation rejected.");
      trace("agent.action.blocked", "A duplicate tool call was blocked.");
      break;
    }
    attempted.add(fingerprint);
    run.status = "executing_tool";
    trace("tool.invoke:" + selected.name, `Agent selected ${selected.name}; server validated permissions and arguments.`);
    // Committing a pending step before waiting makes restart or dropped streams
    // visible. Read-only tools can be retried on a fresh user turn.
    persist();

    const start = Date.now();
    // A provider promise can settle after our deadline. Tools execute against
    // an isolated working copy; late results cannot mutate committed work.
    const workingTask = structuredClone(task);
    const workingSources = structuredClone(sources);
    const workingContext = { ...ctx, task: workingTask, sources: workingSources };
    let outcome: Awaited<ReturnType<typeof selected.execute>>;
    try {
      outcome = await withToolDeadline(selected.execute(args, workingContext), 17000);
      if (outcome.status === "ok" || outcome.status === "partial") {
        task.entities = workingTask.entities;
        task.catalogue = workingTask.catalogue;
        task.evidence = workingTask.evidence;
        task.artifacts = workingTask.artifacts;
        sources.splice(0, sources.length, ...workingSources);
      }
    } catch {
      outcome = {
        status: "error",
        summary: "Tool execution failed or timed out; no late mutation was accepted.",
        // Conservatively reserve a request for potentially in-flight paid I/O.
        requests: selected.name === "task.inspect" || selected.name === "document.create" ? 0 : 1,
      };
    }
    run.requests += outcome.requests;
    run.steps.push({
      id: randomUUID(), tool: selected.name, status: outcome.status,
      requests: outcome.requests, summary: outcome.summary.slice(0,600),
      at: now(), durationMs: Date.now() - start,
    });
    for (const source of sources) {
      const evidenceId = `${task.id}:agent:${runId}:${source.id}`;
      if (!task.evidence.some((e) => e.id === evidenceId)) {
        task.evidence.push({
          id: evidenceId, source: "provider-returned", kind: "practical",
          at: source.retrievedAt, reference: source.url, title: source.title,
          ...(source.imageUrl ? { previewImageUrl: source.imageUrl } : {}),
          entityIds: [], summary: `${source.title}: ${(source.excerpt ?? source.snippet).slice(0,1100)}`,
          limitations: [source.excerpt ? "Provider page text, not independently verified." :
            "Returned search/Places/Qloo source lead; page was not opened."],
          explanation: null, dependencies: [], freshness: "current",
        });
      }
    }
    run.sources = sources.map((source) => ({...source}));
    run.status = "observing";
    trace("tool.result:" + selected.name,
      `${selected.name} returned ${outcome.status}: ${outcome.summary.slice(0,280)}`,
      outcome.requests);
    persist();
    if (outcome.status === "blocked" || outcome.status === "error") {
      run.warnings.push(`${selected.name}: ${outcome.summary.slice(0,220)}`);
    }
    run.status = "reasoning";
  }

  const run = task.agentRun!;
  const savedDocument = run.steps.some(
    (step) => step.tool === "document.create" && step.status === "ok",
  );
  const observedWork = sources.length > 0 ||
    run.steps.some((step) => step.tool.startsWith("qloo.") && step.status === "ok") ||
    savedDocument;
  // Retrieving a source is progress, not necessarily completing the user's
  // request. A successful saved deliverable or an explicit model decision
  // after observing useful work is required before declaring completion.
  run.status = savedDocument || (modelFinished && observedWork)
    ? "completed"
    : "partially_completed";
  if (run.requests >= maxRequests) run.warnings.push("Agent reached the configured external request budget.");
  if (run.status === "partially_completed") {
    run.warnings.push("Agent stopped before a verified completion decision or saved deliverable.");
  }
  persist();
  return {
    // A completed execution must not be reported as a failed/partial provider
    // operation. Evidence limitations remain in warning and source metadata.
    status: run.status === "completed"
      ? "ok"
      : sources.length || run.steps.length ? "partial" : "blocked",
    sources,
    requests: run.requests,
    ...(run.warnings.length ? { warning: run.warnings.join(" ").slice(0,800) } :
      sources.length ? { warning: "Source leads require further verification of availability and price." } :
      { warning: "No verified public source was retrieved." }),
  };
}
