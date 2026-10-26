import { createHash, randomUUID } from "node:crypto";
import type { Task } from "./contracts";

export function appendReceipt(
  task: Task,
  input: unknown,
  fromVersion: number,
  changed: string[],
  traceIdsBefore: string[],
  modelRequests: number,
  status: string = task.status,
  culturalRequests?: number,
) {
  const previous = new Set(traceIdsBefore);
  const traces = task.trace.filter((trace) => !previous.has(trace.id));
  task.receipts = [
    ...(task.receipts ?? []),
    {
      id: randomUUID(),
      fromVersion,
      toVersion: task.brief.version,
      at: new Date().toISOString(),
      inputHash: createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex"),
      changed: [...new Set(changed)],
      culturalRequests:
        culturalRequests ??
        traces
          .filter((t) => t.action.startsWith("cultural."))
          .reduce((total, t) => total + t.requests, 0),
      modelRequests,
      status,
      evidenceIds: task.evidence
        .filter((evidence) => evidence.freshness === "current")
        .map((evidence) => evidence.id),
      artifactIds: task.artifacts
        .filter((a) => a.freshness === "current")
        .map((a) => a.id),
      selection: [...task.brief.selected],
    },
  ].slice(-40);
}
