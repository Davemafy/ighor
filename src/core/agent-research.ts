import { withToolDeadline } from "./execution";
import type { Task } from "./contracts";
import type { ModelProvider } from "../tools/interfaces";
import type {
  ResearchProvider,
  ResearchResult,
  ResearchSource,
} from "../tools/live-research";

const MAX_AGENT_STEPS = 2;
const MAX_SOURCES = 8;
const MAX_RESEARCH_REQUESTS = 8;

const normalizedQuery = (query: string) =>
  query.toLowerCase().replace(/\s+/g, " ").trim();

/** A bounded, read-only observe → decide → execute loop.
 * The model cannot directly choose arbitrary URLs, write state or authorize side effects.
 * Final task persistence and evidence validation remain in the orchestrator. */
export async function agentResearchLoop(
  question: string,
  seedQuery: string,
  initial: ResearchResult,
  provider: ResearchProvider,
  model: ModelProvider,
  task: Task,
  trace: (action: string, outcome: string, requests?: number, evidenceIds?: string[]) => void,
): Promise<ResearchResult> {
  if (!initial.sources.length || !model.chooseResearchStep ||
      (!provider.searchOnce && !provider.readSource)) {
    return initial;
  }

  const result: ResearchResult = {
    ...initial,
    sources: initial.sources.map((source) => ({ ...source })),
  };
  const attempted = new Set([normalizedQuery(seedQuery)]);
  const opened = new Set<string>();
  let nextId = Math.max(
    0,
    ...result.sources.map((s) => Number(s.id.match(/^web-(\d+)$/)?.[1] || 0)),
  ) + 1;

  for (let index = 0; index < MAX_AGENT_STEPS; index++) {
    if (result.requests >= MAX_RESEARCH_REQUESTS) break;
    let step: Awaited<ReturnType<NonNullable<ModelProvider["chooseResearchStep"]>>>;
    try {
      step = await withToolDeadline(
        model.chooseResearchStep(question, result.sources, task, MAX_AGENT_STEPS - index),
        18000,
      );
    } catch {
      trace("agent.decision.error", "Agent could not validate its next research step. Existing evidence was preserved.");
      break;
    }
    if (step.action === "finish") {
      trace("agent.finish", "Agent inspected retrieved evidence and stopped further tool calls.");
      break;
    }

    if (step.action === "search") {
      const query = step.query.trim();
      const normalized = normalizedQuery(query);
      if (!provider.searchOnce || query.length < 4 || query.length > 200 ||
          attempted.has(normalized)) {
        trace("agent.action.blocked", "Repeated or unauthorized follow-up search was rejected.");
        break;
      }
      attempted.add(normalized);
      trace("tool.invoke:agent_search", "Agent requested a targeted follow-up public-web search.");
      try {
        const followup = await withToolDeadline(provider.searchOnce(query), 16000);
        result.requests += followup.requests;
        const known = new Set(result.sources.map((source) => source.url));
        const added: ResearchSource[] = [];
        for (const source of followup.sources) {
          if (known.has(source.url)) continue;
          known.add(source.url);
          added.push({ ...source, id: `web-${nextId++}` });
          if (added.length >= 3) break;
        }
        // Prioritize recently observed sources for synthesis, without
        // fabricating content or discarding their original evidence identities.
        result.sources = [...added, ...result.sources].slice(0, MAX_SOURCES);
        trace(
          "tool.result:agent_search",
          `Follow-up search returned ${followup.status}; ${added.length} distinct new sources.`,
          followup.requests,
        );
        if (followup.status === "error" || followup.status === "blocked") break;
        if (!added.length) break;
      } catch {
        trace("tool.result:agent_search", "Follow-up search timed out; previous evidence was preserved.");
        break;
      }
    } else if (step.action === "read") {
      const chosen = result.sources.find((source) => source.id === step.sourceId);
      // Read only a previously returned source; the model never chooses URLs.
      if (!chosen || chosen.excerpt || opened.has(chosen.id) || !provider.readSource) {
        trace("agent.action.blocked", "Page read was not authorized by a new observed source.");
        break;
      }
      opened.add(chosen.id);
      trace("tool.invoke:agent_read", "Agent requested a read of a source returned by search.");
      try {
        const page = await withToolDeadline(provider.readSource(chosen.url), 16000);
        result.requests += page.requests;
        if (page.status === "ok" && page.excerpt?.trim()) {
          chosen.excerpt = page.excerpt.slice(0, 6000);
        }
        trace(
          "tool.result:agent_read",
          `Source read returned ${page.status}; ${chosen.excerpt ? "page excerpt available" : "no page excerpt"}.`,
          page.requests,
        );
        if (!chosen.excerpt) break;
      } catch {
        trace("tool.result:agent_read", "Page retrieval timed out; saved search evidence was preserved.");
        break;
      }
    } else {
      trace("agent.action.blocked", "Unknown research action rejected by the runtime.");
      break;
    }
  }
  return result;
}
