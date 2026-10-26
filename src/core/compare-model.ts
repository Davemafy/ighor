import { randomUUID } from "node:crypto";
import type { Task, Event } from "./contracts";
import type { ModelProvider } from "../tools/interfaces";

export async function compareModelRankings(
  task: Task,
  model: ModelProvider,
  emit: (event: Event) => void,
) {
  const started = Date.now();
  const callsBefore = model.calls ?? 0;
  emit({
    type: "action",
    message: "Comparing the frozen profiles and candidate pool.",
  });
  const version = task.brief.version;
  const evaluation: NonNullable<Task["evaluation"]> = {
    version: version + 1,
    status: "blocked",
    baseline: [],
    assisted: [],
    warnings: [
      "Configure a server-side model to run the same-pool comparison.",
    ],
    model: model.model ?? "unconfigured",
    at: new Date().toISOString(),
  };

  if (model.recommend) {
    try {
      evaluation.baseline = await model.recommend(structuredClone(task), false);
      evaluation.assisted = await model.recommend(structuredClone(task), true);
      evaluation.status = "ok";
      evaluation.warnings = [
        "Exploratory same-pool ranking, not proof of user relevance or feasible planning. Unknown facts remain unknown.",
      ];
    } catch {
      evaluation.status = "error";
      evaluation.warnings = [
        "Comparison failed safely. No automatic retry or fabricated baseline.",
      ];
    }
  }

  task.evaluation = evaluation;
  task.trace.push({
    id: randomUUID(),
    version: version + 1,
    action: "model.compare",
    requests: (model.calls ?? 0) - callsBefore,
    durationMs: Date.now() - started,
    outcome:
      evaluation.status === "ok"
        ? "Completed independent baseline and assisted tool calls over the same pool."
        : evaluation.warnings.join(" "),
    evidenceIds: [],
    at: new Date().toISOString(),
  });

  return evaluation;
}
