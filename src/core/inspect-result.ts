import type { Evidence, Task } from "./contracts";

export interface ResultInspection {
  id: string;
  freshness: "current" | "stale";
  evidence: Evidence[];
  missingEvidenceIds: string[];
  assumptions: string[];
  unknowns: string[];
  dependencies: string[];
}

/** Read-only projection shared by any result view; never invents missing evidence. */
export function inspectResult(
  task: Task,
  target: { kind: "candidate" | "artifact"; id: string },
): ResultInspection | null {
  const record =
    target.kind === "candidate"
      ? task.candidates.find((candidate) => candidate.id === target.id)
      : task.artifacts.find((artifact) => artifact.id === target.id);

  if (!record) {
    return null;
  }

  const evidenceById = new Map(
    task.evidence.map((evidence) => [evidence.id, evidence]),
  );
  const evidence: Evidence[] = [];
  const missingEvidenceIds: string[] = [];

  for (const id of new Set(record.evidenceIds)) {
    const supportingEvidence = evidenceById.get(id);

    if (supportingEvidence) {
      evidence.push(structuredClone(supportingEvidence));
    } else {
      missingEvidenceIds.push(id);
    }
  }

  return {
    id: record.id,
    freshness:
      record.freshness === "stale" ||
      evidence.some((item) => item.freshness === "stale") ||
      missingEvidenceIds.length > 0
        ? "stale"
        : "current",
    evidence,
    missingEvidenceIds,
    assumptions: "assumptions" in record ? [...record.assumptions] : [],
    unknowns: "missing" in record ? [...record.missing] : [],
    dependencies: [...record.dependencies],
  };
}
