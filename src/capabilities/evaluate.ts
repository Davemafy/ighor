import { assertOutcomeIntegrity } from "./outcome-integrity";
import { candidateIdentity } from "../core/identity";
import type { Candidate, CandidateInput, Task } from "../core/contracts";
import { goalPolicies } from "../core/goals";
import {
  requireEvidence,
  requireCandidateEvidence,
  validateEvidence,
  isEvidenceKind,
} from "../core/evidence";

export function evaluateCandidates(
  options: CandidateInput[],
  task: Pick<Task, "brief" | "evidence">,
): Candidate[] {
  const { budget, duration, location } = task.brief.constraints;

  return options.map((candidate) => {
    const missing: string[] = [];
    const violations: string[] = [];

    if (candidate.cost.value === null) {
      missing.push("Group cost is unknown");
    } else if (candidate.cost.value > budget) {
      violations.push(
        `Group cost $${candidate.cost.value} exceeds the $${budget} budget`,
      );
    }

    if (candidate.duration.value === null) {
      missing.push("Duration is unknown");
    } else if (
      candidate.duration.value +
        (["movie", "tv_show"].includes(candidate.type)
          ? goalPolicies[task.brief.kind].movieOverhead
          : 0) >
      duration
    ) {
      violations.push(
        `Duration including required overhead exceeds ${duration} minutes`,
      );
    }

    if (candidate.available === null) {
      missing.push("Access / availability is unknown");
    } else if (!candidate.available) {
      violations.push("Not available");
    }

    if (
      candidate.location &&
      candidate.location.toLowerCase() !== location.toLowerCase()
    ) {
      missing.push("Practical facts must be reconfirmed for this location");
    }

    const fit: Record<string, number> = {};

    return {
      ...candidate,
      dependencies: [
        "goal",
        "budget",
        "duration",
        "location",
        "catalogue",
        ...task.brief.participants.map(
          (participant) => `preferences:${participant.id}`,
        ),
      ],
      freshness: "current",
      eligibility: violations.length
        ? "ineligible"
        : missing.length
          ? "needs-review"
          : "eligible",
      missing,
      violations,
      fit,
      evidenceIds: task.evidence
        .filter(
          (evidence) =>
            evidence.freshness === "current" &&
            evidence.entityIds.includes(candidateIdentity(candidate)),
        )
        .map((evidence) => evidence.id),
      fitReason:
        "Illustrative tag overlap with each confirmed profile. Negative values flag disagreements; not a probability or Qloo affinity.",
    };
  });
}

export type ArtifactState = Pick<
  Task,
  "brief" | "candidates" | "evidence" | "artifacts" | "schedule"
>;

export function assertArtifactIntegrity(task: ArtifactState) {
  validateEvidence(task.evidence);
  assertOutcomeIntegrity(task);
  const selected = task.brief.selected.map((id) => {
    const candidate = task.candidates.find((candidate) => candidate.id === id);

    if (!candidate) {
      throw new Error("Selection contains an unknown candidate");
    }

    return candidate;
  });

  if (new Set(task.brief.selected).size !== selected.length) {
    throw new Error("Selection repeats a candidate");
  }

  for (const a of task.artifacts.filter((a) => a.freshness === "current")) {
    requireEvidence(a.evidenceIds, task.evidence);

    if (selected.length && !a.edited && !a.evidenceIds.length) {
      throw new Error("Generated artifact requires selection evidence");
    }
  }

  if (
    selected.some(
      (candidate) =>
        candidate.eligibility !== "eligible" ||
        candidate.freshness !== "current",
    )
  ) {
    throw new Error("Selection includes an ineligible or unreviewed option");
  }

  requireCandidateEvidence(selected, task.evidence);
  requireCandidateEvidence(
    selected,
    task.evidence.filter((evidence) => isEvidenceKind(evidence, "cultural")),
  );
  requireCandidateEvidence(
    selected,
    task.evidence.filter((evidence) => isEvidenceKind(evidence, "practical")),
  );

  if (
    evaluateCandidates(selected, {
      brief: task.brief,
      evidence: task.evidence,
    }).some((candidate) => candidate.eligibility !== "eligible")
  ) {
    throw new Error("Selection violates validated constraints");
  }

  for (const candidate of selected) {
    if (
      candidate.cost.value === null ||
      candidate.duration.value === null ||
      candidate.available !== true
    ) {
      throw new Error("Selected option is missing a required practical fact");
    }

    requireEvidence(candidate.evidenceIds, task.evidence);
  }

  if (
    selected.reduce(
      (total, candidate) => total + (candidate.cost.value ?? 0),
      0,
    ) > task.brief.constraints.budget
  ) {
    throw new Error("Selection exceeds budget");
  }

  if (
    task.schedule.reduce((total, x) => total + x.minutes, 0) >
    task.brief.constraints.duration
  ) {
    throw new Error("Programme exceeds the duration");
  }

  if (
    !goalPolicies[task.brief.kind].programme &&
    selected.reduce(
      (total, candidate) => total + (candidate.duration.value ?? 0),
      0,
    ) > task.brief.constraints.duration
  ) {
    throw new Error("Reference selection exceeds the duration");
  }

  if (goalPolicies[task.brief.kind].programme && selected.length) {
    if (
      selected.filter((candidate) =>
        ["movie", "tv_show"].includes(candidate.type),
      ).length !== 1 ||
      selected.filter((candidate) => candidate.type === "artist").length > 1 ||
      selected.some(
        (candidate) => !["movie", "tv_show", "artist"].includes(candidate.type),
      )
    ) {
      throw new Error("Invalid gathering selection");
    }

    const candidateRows = task.schedule.filter(
      (segment) => segment.candidateId !== null,
    );

    if (
      candidateRows.length !== selected.length ||
      selected.some(
        (candidate) =>
          candidateRows.filter(
            (segment) =>
              segment.candidateId === candidate.id &&
              segment.minutes === candidate.duration.value,
          ).length !== 1,
      ) ||
      task.schedule
        .filter((segment) => segment.candidateId === null)
        .reduce((total, segment) => total + segment.minutes, 0) !==
        goalPolicies.gathering.movieOverhead
    ) {
      throw new Error("Programme does not match its selected facts");
    }
  } else if (task.schedule.length) {
    throw new Error("A reference goal must not inherit a gathering schedule");
  }
}
