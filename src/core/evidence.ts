import {
  EvidenceSchema,
  type Evidence,
  type CandidateInput,
} from "./contracts";
import { candidateIdentity } from "./identity";

export function validateEvidence(raw: unknown): Evidence[] {
  const records = EvidenceSchema.array().parse(raw);

  if (new Set(records.map((evidence) => evidence.id)).size !== records.length) {
    throw new Error("Duplicate evidence identity");
  }

  for (const evidence of records) {
    if (
      !evidence.reference.trim() ||
      !evidence.summary.trim() ||
      !Number.isFinite(Date.parse(evidence.at))
    ) {
      throw new Error(
        "Evidence requires a reference, summary and recording time",
      );
    }

    if (
      (evidence.source === "illustrative-example" ||
        evidence.source === "recorded-fixture") &&
      evidence.explanation !== null
    ) {
      throw new Error("Fixture metadata cannot assert provider explainability");
    }
  }

  return records;
}

export function requireEvidence(ids: string[], records: Evidence[]): void {
  const current = new Set(
    records
      .filter((evidence) => evidence.freshness === "current")
      .map((evidence) => evidence.id),
  );

  if (ids.some((id) => !current.has(id))) {
    throw new Error("Artifact references missing or stale evidence");
  }
}

export function requireCandidateEvidence(
  options: CandidateInput[],
  records: Evidence[],
): void {
  for (const candidate of options) {
    if (
      !records.some(
        (evidence) =>
          evidence.freshness === "current" &&
          evidence.entityIds.includes(candidateIdentity(candidate)),
      )
    ) {
      throw new Error("Candidate requires attributable current evidence");
    }
  }
}

export function isEvidenceKind(
  evidence: Evidence,
  kind: "cultural" | "practical",
) {
  return (
    evidence.kind === kind ||
    (!evidence.kind &&
      evidence.id.startsWith(kind === "cultural" ? "cultural:" : "facts:"))
  );
}

export function replaceEvidence(
  existing: Evidence[],
  incoming: Evidence[],
  kind: "cultural" | "practical",
): Evidence[] {
  return validateEvidence([
    ...existing.filter((evidence) => !isEvidenceKind(evidence, kind)),
    ...incoming.map((evidence) => ({ ...evidence, kind })),
  ]);
}
