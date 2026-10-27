import { groundQuestionAnswer } from "./question-grounding";
import type { FormAnswerGrounding } from "./conversation";
import { mutateCanvas } from "./presentation";
import { ensureBoundPresentation } from "./presentation-default";
import { randomUUID } from "node:crypto";
import {
  TurnSchema,
  TaskSchema,
  type Task,
  type Event,
  type ExecutionTrace,
} from "./contracts";
import { ConflictError, type TaskStore } from "../data/store";
import { SuppliedFactsProvider } from "../tools/fixture-provider";
import type {
  CulturalProvider,
  ModelProvider,
  PracticalFactsProvider,
} from "../tools/interfaces";
import {
  runtimeCulturalProvider,
  runtimeModelProvider,
} from "../tools/runtime";
import { safeSerialize } from "../tools/qloo";
import { ExecutionBudget } from "./execution";
import { invalidate } from "./revision";
import { appendReceipt } from "./receipts";
import { applyStructuredTurn } from "./apply-turn";
import { interpretMessage } from "./interpret-message";
import { compareModelRankings } from "./compare-model";
import { executeTaskPlan } from "./execute-plan";
import { turnReply } from "./turn-reply";
import { applyWorkActions } from "./connected-work";
import { recordArtifactChanges } from "./preserve-artifacts";
import { agentEmitter } from "./agent-events";

export { ExecutionBudget } from "./execution";

export async function runTurn(
  store: TaskStore,
  id: string,
  owner: string,
  raw: unknown,
  send: (event: Event) => void = () => {},
  provider?: CulturalProvider,
  model?: ModelProvider,
  factsProvider: PracticalFactsProvider = new SuppliedFactsProvider(),
): Promise<Task> {
  let input = TurnSchema.parse(raw);
  let formAnswer: FormAnswerGrounding | undefined;
  let task = store.load(id, owner);

  if (task.brief.version !== input.version) {
    throw new ConflictError("A newer correction is already saved.");
  }

  // A form submission is one real user turn: validate, share answers with the
  // agent, and save the answer state atomically with the resulting task.
  if (input.type === "canvas" && input.mutation.operation === "answer") {
    if (!task.canvas) {
      throw new Error("No question exists for this task.");
    }

    const questionId = input.mutation.nodeId;
    const question = task.canvas.surface.nodes.find(
      (node) => node.id === questionId,
    );

    if (question?.type !== "question") {
      throw new Error("Question not found.");
    }

    task.canvas = mutateCanvas(
      task.canvas,
      input.surfaceId,
      input.mutation,
      task,
    );
    const answers = task.canvas.answers[`${input.surfaceId}:${question.id}`];
    formAnswer = groundQuestionAnswer(question, answers);
    const text = [
      question.title || question.prompt,
      ...question.fields.map(
        (field) => `${field.label}: ${answers[field.id] || "Not supplied"}`,
      ),
    ].join("\n");
    // The external answer payload has already passed its own bounded schema.
    // Keep every field when converting it to an internal message.
    input = { type: "message", text, version: input.version };
  }

  const emit = agentEmitter(structuredClone(task), send);

  if (input.type === "canvas") {
    if (!task.canvas) {
      throw new Error("No canvas exists for this task.");
    }

    task.canvas = mutateCanvas(
      task.canvas,
      input.surfaceId,
      input.mutation,
      task,
    );
    task.brief.version++;
    task.trace.push({
      id: randomUUID(),
      version: task.brief.version,
      action: "ui." + input.mutation.operation,
      outcome: "Saved a direct canvas edit to the shared task.",
      requests: 0,
      durationMs: 0,
      evidenceIds: [],
      at: new Date().toISOString(),
    });
    task.trace = task.trace.slice(-100);
    TaskSchema.parse(task);
    store.save(task, input.version, owner);
    emit({ type: "done", task: structuredClone(task) });

    return task;
  }

  const wasInterpretationError =
    task.status === "error" &&
    task.trace.at(-1)?.action === "model.interpret.error";
  model ??= runtimeModelProvider(task.mode);
  const receiptFromVersion = task.brief.version;
  const receiptTraceIds = task.trace.map((entry) => entry.id);
  const initialModelCalls = model.calls ?? 0;
  const initialCulturalCalls = provider?.calls ?? 0;

  const culturalRequestDelta = () => {
    const calls = provider?.calls;

    return calls === undefined ? undefined : calls - initialCulturalCalls;
  };

  task.modelMode = model.executionMode ?? "scripted";

  if (input.type === "baseline") {
    const version = task.brief.version;
    const comparison = await compareModelRankings(task, model, emit);
    task.brief.version++;
    appendReceipt(
      task,
      input,
      receiptFromVersion,
      ["evaluation"],
      receiptTraceIds,
      (model.calls ?? 0) - initialModelCalls,
      comparison.status,
      culturalRequestDelta(),
    );
    TaskSchema.parse(task);
    store.save(task, version, owner);
    emit({ type: "done", task });

    return task;
  }

  const budget = new ExecutionBudget();
  const at = () => new Date().toISOString();

  const trace = (
    action: string,
    outcome: string,
    requests = 0,
    evidenceIds: string[] = [],
    durationMs = 0,
  ) => {
    outcome = JSON.parse(safeSerialize(outcome)) as string;
    const row: ExecutionTrace = {
      id: randomUUID(),
      version: task.brief.version,
      action,
      outcome,
      requests,
      evidenceIds,
      durationMs,
      at: at(),
    };
    task.trace.push(row);
    const kind = action.startsWith("tool.invoke:")
      ? "tool-invocation"
      : action.startsWith("tool.result:")
        ? "tool-result"
        : action.includes("error")
          ? "action-failed"
          : "task-progress";
    emit({
      type: "action",
      message: outcome,
      activity: {
        eventId: row.id,
        threadId: task.id,
        taskId: task.id,
        sequence: task.trace.length,
        kind,
        actionStatus:
          kind === "tool-invocation"
            ? "executing"
            : kind === "action-failed"
              ? "failed"
              : kind === "tool-result" && outcome.includes("returned blocked")
                ? "blocked"
                : kind === "tool-result" && outcome.includes("returned error")
                  ? "failed"
                  : "completed",
        rendererType: "execution",
        evidenceIds,
      },
    });
  };

  const update =
    input.type === "message"
      ? await interpretMessage(task, input, model, budget, trace, formAnswer)
      : applyStructuredTurn(task, input, {
          taskId: id,
          owner,
          readMemory: () => store.memory(owner),
        });
  task = update.task;

  if (update.uiOnly) {
    // A conversational view switch is already validated by mutateCanvas.
    // Commit it like a direct edit: no cultural provider, planner or unrelated
    // artifact invalidation. A later real task can use this persisted state.
    task.brief.version++;
    task.trace = task.trace.slice(-100);
    appendReceipt(
      task,
      input,
      receiptFromVersion,
      ["canvas:view"],
      receiptTraceIds,
      (model.calls ?? 0) - initialModelCalls,
      task.status,
      0,
    );
    TaskSchema.parse(task);
    store.save(task, receiptFromVersion, owner);
    emit({ type: "done", task: structuredClone(task) });

    return task;
  }

  if (update.conversationOnly) {
    ensureBoundPresentation(task);

    if (wasInterpretationError) {
      task.error = null;
      task.status = task.brief.goal ? "partial" : "draft";
    }

    task.brief.version++;
    task.trace = task.trace.slice(-100);
    appendReceipt(
      task,
      input,
      receiptFromVersion,
      [],
      receiptTraceIds,
      (model.calls ?? 0) - initialModelCalls,
      task.status,
      0,
    );
    TaskSchema.parse(task);
    store.save(task, receiptFromVersion, owner);
    emit({ type: "done", task: structuredClone(task) });

    return task;
  }

  if (update.interpretationFailed) {
    task.brief.version++;
    appendReceipt(
      task,
      input,
      receiptFromVersion,
      [],
      receiptTraceIds,
      (model.calls ?? 0) - initialModelCalls,
      task.status,
      culturalRequestDelta(),
    );
    TaskSchema.parse(task);
    store.save(task, receiptFromVersion, owner);
    emit({ type: "done", task });

    return task;
  }

  if (update.workActions && !update.workAfterDiscovery) {
    const before = structuredClone(task);

    try {
      const summary = applyWorkActions(
        task,
        update.workActions,
        input.type === "message" ? input.text : undefined,
        formAnswer,
      );
      trace(
        "planner.work",
        "Selected connected composition/revision. No cultural or external request was made.",
      );
      task.messages.push({ role: "assistant", text: summary, at: at() });
    } catch (error) {
      task = before;
      task.status = "clarification";
      const question =
        error instanceof Error
          ? error.message
          : "This work update could not be applied.";
      task.messages.push({
        role: "assistant",
        kind: "conversation",
        text: question,
        at: at(),
      });
      trace("work.rejected", question);
    }

    // Connected-work turns return early; bind their latest documents before saving.
    ensureBoundPresentation(task);
    task.brief.version++;
    task.trace = task.trace.slice(-100);
    appendReceipt(
      task,
      input,
      receiptFromVersion,
      ["work"],
      receiptTraceIds,
      (model.calls ?? 0) - initialModelCalls,
      task.status,
      0,
    );
    TaskSchema.parse(task);
    store.save(task, receiptFromVersion, owner);
    emit({ type: "done", task: structuredClone(task) });

    return task;
  }

  provider ??= runtimeCulturalProvider(task.mode);

  const { changedDependencies, artifactEdit, localChangeOnly, memoryChange } =
    update;

  if (artifactEdit) {
    changedDependencies.push(artifactEdit.artifactId);
  }

  const editedArtifactWasCurrent = artifactEdit
    ? task.artifacts.find((a) => a.id === artifactEdit.artifactId)
        ?.freshness === "current"
    : false;

  if (task.mode === "qloo-live") {
    task.evidence.forEach((evidence) => {
      if (evidence.source === "provider-returned") {
        evidence.delivery = "CACHED";
      }
    });
    [...task.catalogue, ...task.candidates].forEach((candidate) =>
      Object.values(candidate.cultural ?? {}).forEach((association) => {
        association.delivery = "CACHED";
      }),
    );
  }

  if (
    task.brief.contextAnchor &&
    changedDependencies.length &&
    changedDependencies.every(
      (dependency) =>
        dependency === "selection" || dependency.startsWith("preferences:"),
    )
  ) {
    update.needsDiscovery = false;
  }

  const oldVersion = task.brief.version;
  const stale = invalidate(task, changedDependencies);
  task.brief.version++;
  task.status = "running";
  task.error = null;

  if (artifactEdit) {
    const a = task.artifacts.find((a) => a.id === artifactEdit.artifactId);

    if (!a) {
      throw new Error("Artifact not found.");
    }

    a.freshness = "stale";
  }

  // Publish stale outputs before waiting on providers; the UI must not show them as current.
  store.save(task, oldVersion, owner);
  emit({ type: "state", task: structuredClone(task) });

  if (stale.length) {
    trace(
      "revision.invalidate",
      `Marked ${stale.length} dependent records stale.`,
    );
  }

  const stageVersion = task.brief.version;

  const previousArtifacts = structuredClone(task.artifacts);
  const previousEvidence = structuredClone(task.evidence);
  task = await executeTaskPlan(
    task,
    update,
    {
      cultural: provider,
      facts: factsProvider,
      budget,
      trace,
      now: at,
    },
    editedArtifactWasCurrent,
  );

  let connectedReply = "";

  if (update.workActions?.length && update.workAfterDiscovery) {
    const culturalStatus = task.status;
    const culturalNote = task.error ?? task.brief.unresolved.join(" ");

    try {
      connectedReply = applyWorkActions(
        task,
        update.workActions,
        input.type === "message" ? input.text : undefined,
        formAnswer,
      );
      changedDependencies.push("work");
      trace(
        "planner.work",
        "Applied connected proposals after the cultural capability. Unretrieved relationships remain proposals, not evidence.",
      );

      if (culturalStatus !== "ready") {
        task.status = "partial";
        connectedReply += `\n\nCultural step remains ${culturalStatus}: ${culturalNote || "Some cultural or practical evidence remains unresolved."}`;
      }
    } catch (error) {
      task.status = "partial";
      connectedReply =
        error instanceof Error
          ? error.message
          : "Connected proposals could not be applied.";
      trace("work.rejected", connectedReply);
    }
  }

  recordArtifactChanges(task, previousArtifacts);
  const archive = [...(task.evidenceArchive ?? [])];

  for (const old of previousEvidence) {
    const next = task.evidence.find((e) => e.id === old.id);

    if (
      (!next || next.at !== old.at || next.summary !== old.summary) &&
      !archive.some(
        (e) => e.id === old.id && e.at === old.at && e.summary === old.summary,
      )
    ) {
      archive.push(old);
    }
  }

  task.evidenceArchive = archive;

  if (task.work) {
    const affectedDecisions = task.work.decisions.filter((d) =>
      d.evidenceIds.some(
        (id) =>
          !task.evidence.some((e) => e.id === id && e.freshness === "current"),
      ),
    );

    for (const decision of affectedDecisions) {
      decision.conflict =
        "Cited evidence changed. Your decision is preserved; review its support.";
    }

    const staleIds = new Set<string>(
      task.work.documents
        .filter((d) =>
          d.evidenceIds.some(
            (id) =>
              !task.evidence.some(
                (e) => e.id === id && e.freshness === "current",
              ),
          ),
        )
        .map((d) => `document:${d.id}`),
    );
    affectedDecisions.forEach((d) => staleIds.add(`decision:${d.id}`));
    let expanded = true;

    while (expanded) {
      expanded = false;

      for (const doc of task.work.documents) {
        if (
          doc.dependencies.some((id) => staleIds.has(id)) &&
          !staleIds.has(`document:${doc.id}`)
        ) {
          staleIds.add(`document:${doc.id}`);
          expanded = true;
        }
      }
    }

    for (const doc of task.work.documents) {
      if (staleIds.has(`document:${doc.id}`)) {
        doc.freshness = "stale";
        doc.conflict =
          "Cited evidence or a dependent document changed. Review before reusing this proposal.";
      }
    }
  }

  ensureBoundPresentation(task);
  task.brief.version++;
  task.trace = task.trace.slice(-100);
  task.messages.push({
    role: "assistant",
    text: connectedReply || turnReply(task, localChangeOnly),
    at: at(),
  });
  TaskSchema.parse(task);
  appendReceipt(
    task,
    input,
    receiptFromVersion,
    changedDependencies,
    receiptTraceIds,
    (model.calls ?? 0) - initialModelCalls,
    task.status,
    culturalRequestDelta(),
  );
  TaskSchema.parse(task);
  // A newer correction can commit during a provider call. The version check rejects the late result.
  store.save(
    task,
    stageVersion,
    owner,
    task.status !== "error" ? memoryChange : undefined,
  );
  emit({ type: "done", task: structuredClone(task) });

  return task;
}
