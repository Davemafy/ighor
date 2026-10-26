import type { Task, Artifact } from "../core/contracts";
import {
  OutcomeDetailsSchema,
  type OutcomeDetails,
  type OutcomeSpec,
} from "../core/outcome-spec";
import { candidateIdentity } from "../core/identity";
import { isEvidenceKind, requireEvidence } from "../core/evidence";
type OutcomeTask = Pick<
  Task,
  "brief" | "candidates" | "evidence" | "artifacts"
>;
type ReferenceIndex = Map<string, OutcomeDetails["references"][number]>;

export function assertOutcomeIntegrity(task: OutcomeTask) {
  for (const artifact of task.artifacts.filter(
    (artifact) => artifact.freshness === "current" && artifact.details,
  )) {
    const details = OutcomeDetailsSchema.parse(artifact.details);
    const spec = assertRequestedOutcome(task, artifact, details);
    const references = assertOutcomeReferences(task, artifact, details);
    assertOutcomeClaims(task, artifact, details, references);
    assertOutcomeSchedule(task, details, spec, references);
  }
}

function assertRequestedOutcome(
  task: OutcomeTask,
  artifact: Artifact,
  details: OutcomeDetails,
): OutcomeSpec {
  if (task.brief.outcome?.kind !== details.kind) {
    throw new Error("Output does not match requested outcome");
  }

  const spec = task.brief.outcome!;
  const expectedKind =
    details.kind === "research"
      ? "research-report"
      : details.kind === "listening"
        ? "listening-plan"
        : details.kind;

  if (artifact.kind !== expectedKind) {
    throw new Error("Outcome artifact kind differs");
  }

  if (details.kind !== "itinerary" && details.days !== 1) {
    throw new Error("Only an itinerary can span days");
  }

  if (
    ["research", "music-direction"].includes(details.kind) &&
    (details.segments.length ||
      task.brief.selected.length ||
      details.status !== "references-only")
  ) {
    throw new Error("References are not scheduled activities");
  }

  if (["itinerary", "listening"].includes(details.kind)) {
    const feasible =
      details.segments.length > 0 &&
      (spec.kind !== "itinerary" || spec.transferMinutes !== null);

    if (
      details.status !==
      (feasible ? "feasible-from-supplied-facts" : "provisional")
    ) {
      throw new Error("Outcome overstates planning certainty");
    }
  }

  return spec;
}

function assertOutcomeReferences(
  task: OutcomeTask,
  artifact: Artifact,
  details: OutcomeDetails,
): ReferenceIndex {
  const refs = new Map(details.references.map((r) => [r.candidateId, r]));

  if (refs.size !== details.references.length) {
    throw new Error("Duplicate outcome reference");
  }

  for (const r of details.references) {
    const candidate = task.candidates.find(
      (candidate) =>
        candidate.id === r.candidateId && candidate.freshness === "current",
    );

    if (!candidate || candidate.eligibility !== r.eligibility) {
      throw new Error("Outcome reference is missing or stale");
    }

    const requiredType =
      details.kind === "itinerary"
        ? "place"
        : details.kind === "research"
          ? null
          : "artist";

    if (requiredType && candidate.type !== requiredType) {
      throw new Error("Reference has wrong cultural type");
    }

    requireEvidence(r.evidenceIds, task.evidence);

    if (
      !r.evidenceIds.some((id) =>
        task.evidence.some(
          (evidence) =>
            evidence.id === id &&
            isEvidenceKind(evidence, "cultural") &&
            evidence.entityIds.includes(candidateIdentity(candidate)),
        ),
      )
    ) {
      throw new Error("Reference lacks cultural evidence");
    }

    if (
      !r.evidenceIds.length ||
      r.evidenceIds.some(
        (id) =>
          !artifact.evidenceIds.includes(id) ||
          !candidate.evidenceIds.includes(id),
      )
    ) {
      throw new Error("Outcome reference has unrelated evidence");
    }
  }

  return refs;
}

function assertOutcomeClaims(
  task: OutcomeTask,
  artifact: Artifact,
  details: OutcomeDetails,
  refs: ReferenceIndex,
) {
  for (const claim of details.claims) {
    requireEvidence(claim.evidenceIds, task.evidence);

    if (
      claim.candidateIds.some((id) => !refs.has(id)) ||
      claim.evidenceIds.some((id) => !artifact.evidenceIds.includes(id))
    ) {
      throw new Error("Claim exceeds outcome evidence");
    }

    if (
      ["retrieved-association", "supplied-fact"].includes(claim.basis) &&
      (!claim.candidateIds.length || !claim.evidenceIds.length)
    ) {
      throw new Error("Factual claim requires evidence");
    }

    if (
      claim.evidenceIds.some(
        (id) =>
          !claim.candidateIds.some((cid) =>
            task.candidates
              .find((candidate) => candidate.id === cid)
              ?.evidenceIds.includes(id),
          ),
      )
    ) {
      throw new Error("Claim cites unrelated evidence");
    }

    for (const id of claim.candidateIds) {
      const candidate = task.candidates.find(
        (candidate) => candidate.id === id,
      )!;

      if (
        !claim.evidenceIds.some(
          (eid) =>
            candidate.evidenceIds.includes(eid) &&
            task.evidence.some(
              (evidence) =>
                evidence.id === eid &&
                evidence.entityIds.includes(candidateIdentity(candidate)) &&
                isEvidenceKind(
                  evidence,
                  claim.basis === "supplied-fact" ? "practical" : "cultural",
                ),
            ),
        )
      ) {
        throw new Error("Claim attribution is unsupported");
      }
    }
  }
}

function assertOutcomeSchedule(
  task: OutcomeTask,
  details: OutcomeDetails,
  spec: OutcomeSpec,
  refs: ReferenceIndex,
) {
  let total = 0;
  let cost = 0;
  const seen = new Set<string>();
  const last = new Map<number, number>();

  for (const row of details.segments) {
    const candidate = task.candidates.find(
      (candidate) => candidate.id === row.candidateId,
    );

    if (
      !candidate ||
      !refs.has(candidate.id) ||
      candidate.eligibility !== "eligible" ||
      candidate.freshness !== "current" ||
      seen.has(candidate.id) ||
      !task.brief.selected.includes(candidate.id) ||
      candidate.duration.value !== row.minutes
    ) {
      throw new Error("Invalid scheduled outcome option");
    }

    const required = last.has(row.day)
      ? spec.kind === "itinerary"
        ? spec.transferMinutes
        : spec.kind === "listening"
          ? spec.transitionMinutes
          : null
      : 0;

    if (
      required === null ||
      row.transferBefore !== required ||
      row.day > details.days ||
      row.startMinute !== (last.get(row.day) ?? 0) + row.transferBefore
    ) {
      throw new Error("Unverified or inconsistent transition");
    }

    const end = row.startMinute + row.minutes;

    if (end > task.brief.constraints.duration / details.days) {
      throw new Error("Day exceeds allocated time");
    }

    last.set(row.day, end);
    seen.add(candidate.id);
    total += row.minutes + row.transferBefore;
    cost += candidate.cost.value!;
  }

  if (
    details.totalMinutes !== total ||
    details.totalCost !== cost ||
    total > task.brief.constraints.duration ||
    cost > task.brief.constraints.budget
  ) {
    throw new Error("Outcome totals violate confirmed constraints");
  }

  if (details.segments.length && seen.size !== task.brief.selected.length) {
    throw new Error("Outcome selection and schedule differ");
  }

  if (
    details.kind === "itinerary" &&
    details.days !==
      (task.brief.outcome?.kind === "itinerary" ? task.brief.outcome.days : 0)
  ) {
    throw new Error("Itinerary day count differs");
  }
}
