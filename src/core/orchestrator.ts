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

export { ExecutionBudget } from "./execution";

export async function runTurn(
  store: TaskStore,
  id: string,
  owner: string,
  raw: unknown,
  emit: (event: Event) => void = () => {},
  provider?: CulturalProvider,
  model?: ModelProvider,
  factsProvider: PracticalFactsProvider = new SuppliedFactsProvider(),
): Promise<Task> {
  const input = TurnSchema.parse(raw);
  let task = store.load(id, owner);

  if (task.brief.version !== input.version) {
    throw new ConflictError("A newer correction is already saved.");
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
    emit({ type: "action", message: outcome });
  };

  const update =
    input.type === "message"
      ? await interpretMessage(task, input, model, budget, trace)
      : applyStructuredTurn(task, input, {
          taskId: id,
          owner,
          readMemory: () => store.memory(owner),
        });
  task = update.task;

  if (update.conversationOnly) {
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

  task.brief.version++;
  task.trace = task.trace.slice(-100);
  task.messages.push({
    role: "assistant",
    text: turnReply(task, localChangeOnly),
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
