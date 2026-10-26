import type { Artifact, Candidate, Task } from "../core/contracts";
import { reconcileGeneratedArtifact, hasLockedConflict, finalizeConnectedArtifacts } from "../core/connected-artifacts";
import {
  OutcomeDetailsSchema,
  type OutcomeDetails,
  type OutcomeSpec,
} from "../core/outcome-spec";
import { renderOutcomeDocument } from "./outcome-document";
import { groupUtility } from "./collaborate";
import { candidateIdentity } from "../core/identity";
import { isEvidenceKind } from "../core/evidence";

type Input = Pick<Task, "brief" | "candidates" | "evidence" | "artifacts">;

/** Deterministic output strategies over the same evaluated, evidence-linked candidates. */
export function composeOutcome(input: Input) {
  const spec = input.brief.outcome!;
  const type =
    spec.kind === "itinerary"
      ? "place"
      : spec.kind === "research"
        ? null
        : "artist";
  const references = selectOutcomeReferences(input, type);
  const details: OutcomeDetails = {
    kind: spec.kind,
    status: "references-only",
    references: references.map((candidate) => ({
      candidateId: candidate.id,
      evidenceIds: candidate.evidenceIds,
      eligibility: candidate.eligibility,
      caveats: [...candidate.missing, ...candidate.violations],
    })),
    segments: [],
    days: spec.kind === "itinerary" ? spec.days : 1,
    totalCost: 0,
    totalMinutes: 0,
    openQuestions: [],
    claims: [],
  };
  const selected: Candidate[] = [];
  const scheduled = spec.kind === "itinerary" || spec.kind === "listening";

  if (scheduled) {
    selected.push(
      ...scheduleOutcomeActivities(input, spec, references, details),
    );
  } else {
    details.openQuestions.push(
      spec.kind === "research"
        ? "This is a synthesis of retrieved cultural associations, not trend detection, an audience study or independent source research."
        : "Entity associations do not establish restaurant atmosphere, diner preferences, suitable tracks or commercial playback rights.",
    );
  }

  appendOutcomeClaims(input, references, selected, details);

  if (!references.length) {
    details.openQuestions.push(
      "No current evidence-linked references of the required type. Refresh discovery or clarify the goal.",
    );
  }

  const evidenceIds = [
    ...new Set(references.flatMap((candidate) => candidate.evidenceIds)),
  ];
  const title = {
    itinerary: "A cultural journey, with the gaps visible",
    listening: "A listening programme to refine",
    research: "What the cultural evidence supports",
    "music-direction": "A music direction, grounded in references",
  }[spec.kind];
  const content = renderOutcomeDocument(
    title,
    details,
    references,
    input.brief,
  );
  const kind =
    spec.kind === "listening"
      ? "listening-plan"
      : spec.kind === "research"
        ? "research-report"
        : spec.kind;
  const previous = input.artifacts.find((a) => a.id === "main");
  const artifact: Artifact = reconcileGeneratedArtifact({
    id: "main",
    kind,
    title,
    content,
    details: OutcomeDetailsSchema.parse(details),
    version: (previous?.version ?? 0) + 1,
    dependencies: [
      "outcome",
      "goal",
      ...(spec.kind === "music-direction" || spec.kind === "research"
        ? []
        : ["budget", "duration", "location", "selection"]),
      "catalogue",
      "contextAnchor",
      ...(spec.kind === "music-direction" || spec.kind === "research"
        ? []
        : references.map((candidate) => `candidate:${candidate.id}`)),
      ...evidenceIds,
    ],
    evidenceIds,
    assumptions: details.openQuestions,
    freshness: "current",
    edited: false,
  }, previous);

  // Music-direction outcomes can become a useful, connected body of work.
  // These are drafts grounded in cultural references, not booked activities.
  const related: Artifact[] = [];
  if (spec.kind === "music-direction" && references.length) {
    const sourceNames = references.slice(0, 3).map((candidate) => candidate.name);
    const culturalLine = sourceNames.join(", ");
    const produce = (
      id: string,
      kind: Artifact["kind"],
      title: string,
      content: string,
      directInputs: string[],
    ) => {
      const prior = input.artifacts.find((item) => item.id === id);
      related.push(
        reconcileGeneratedArtifact({
          id,
          kind,
          title,
          content,
          version: (prior?.version ?? 0) + 1,
          dependencies: ["goal", "main", ...directInputs, ...evidenceIds],
          evidenceIds,
          assumptions: [
            "Conceptual draft from Qloo-linked cultural references, not real-world availability, commercial rights or measured demand.",
          ],
          freshness: "current",
          edited: false,
        }, prior),
      );
    };

    produce(
      "concept",
      "creative-brief",
      "A shared experience concept",
      [
        "Concept direction for review",
        `Build an intimate experience around the cultural references ${culturalLine}.`,
        `Proposed location: ${input.brief.constraints.location} (working brief value; confirm before using; suitability not verified).`,
        "Explore a cohesive visual and listening atmosphere, then validate real venues, budget, rights and guest preferences before publishing.",
      ].join("\n\n"),
      ["location"],
    );
    produce(
      "invitation",
      "invitation",
      "A starting invitation",
      [
        "You're invited to explore an intimate listening experience.",
        `Cultural starting points: ${culturalLine}.`,
        `Location under consideration: ${input.brief.constraints.location}.`,
        "Date, availability, guests and practical arrangements to be confirmed.",
      ].join("\n\n"),
      ["location", "concept"],
    );
  }

  const artifacts = finalizeConnectedArtifacts([artifact, ...related], input.artifacts);

  return {
    artifacts,
    selected: selected.map((candidate) => candidate.id),
    schedule: [],
    status: (hasLockedConflict(artifacts) || (scheduled && !selected.length)
      ? "partial"
      : references.length
        ? "ready"
        : "partial") as "ready" | "partial",
  };
}

function selectOutcomeReferences(input: Input, type: Candidate["type"] | null) {
  return input.candidates
    .filter(
      (candidate) =>
        candidate.freshness === "current" && (!type || candidate.type === type),
    )
    .filter((candidate) =>
      input.evidence.some(
        (evidence) =>
          evidence.freshness === "current" &&
          isEvidenceKind(evidence, "cultural") &&
          evidence.entityIds.includes(candidateIdentity(candidate)),
      ),
    )
    .sort(
      (a, b) =>
        groupUtility(b.fit) - groupUtility(a.fit) || a.id.localeCompare(b.id),
    );
}

function scheduleOutcomeActivities(
  input: Input,
  spec: Extract<OutcomeSpec, { kind: "itinerary" | "listening" }>,
  references: Candidate[],
  details: OutcomeDetails,
) {
  const selected: Candidate[] = [];
  const timeBudget = input.brief.constraints.duration;
  const cap = timeBudget / details.days;

  const transfer =
    spec.kind === "itinerary" ? spec.transferMinutes : spec.transitionMinutes;

  if (transfer === null) {
    details.openQuestions.push(
      "Supply a transfer allowance in minutes. No route or travel time has been verified.",
    );
  }

  let day = 1;
  let elapsed = 0;
  const pinned = input.brief.pinned ?? [];
  const options = pinned.length
    ? pinned
        .map((id) => references.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is Candidate => Boolean(candidate))
    : references;

  for (const candidate of options.filter(
    (candidate) => candidate.eligibility === "eligible",
  )) {
    if (!candidate.duration.value || candidate.duration.value > cap) {
      continue;
    }

    // Unknown inter-stop travel permits one stop per day, never a fabricated route.
    let previous = details.segments.some((segment) => segment.day === day);

    if (previous && transfer === null) {
      day++;
      elapsed = 0;
      previous = false;
    }

    let before = previous ? (transfer ?? 0) : 0;

    if (elapsed + before + candidate.duration.value! > cap) {
      day++;
      elapsed = 0;
      before = 0;
    }

    if (day > details.days) {
      break;
    }

    if (
      details.totalCost + candidate.cost.value! >
      input.brief.constraints.budget
    ) {
      continue;
    }

    details.segments.push({
      candidateId: candidate.id,
      day,
      startMinute: elapsed + before,
      minutes: candidate.duration.value!,
      transferBefore: before,
    });
    elapsed += before + candidate.duration.value!;
    details.totalCost += candidate.cost.value!;
    details.totalMinutes += before + candidate.duration.value!;
    selected.push(candidate);

    if (selected.length === (spec.kind === "itinerary" ? spec.days * 3 : 12)) {
      break;
    }
  }

  if (
    pinned.length &&
    (selected.length !== pinned.length ||
      !pinned.every((id) => selected.some((candidate) => candidate.id === id)))
  ) {
    selected.length = 0;
    details.segments = [];
    details.totalMinutes = 0;
    details.totalCost = 0;
    details.openQuestions.push(
      "The complete pinned selection cannot fit the confirmed facts and allowances. Change it or let Igor choose.",
    );
  }

  if (!selected.length) {
    details.openQuestions.push(
      "Supply cost, duration and access for options before Igor schedules them.",
    );
  }

  if (
    references.some((candidate) => candidate.eligibility === "needs-review")
  ) {
    details.openQuestions.push(
      "Unreviewed options remain references only; they are not scheduled.",
    );
  }

  if (spec.kind === "itinerary") {
    details.openQuestions.push(
      "Dates, opening windows, bookings and geographic route feasibility remain unverified. Time is the total cultural activity budget, divided equally across days.",
    );
  }

  if (spec.kind === "listening") {
    details.openQuestions.push(
      "Artist-level programme only. Tracks, playback access, sequencing within artist sets and performance rights are not verified.",
    );
  }

  details.status =
    selected.length && (spec.kind !== "itinerary" || transfer !== null)
      ? "feasible-from-supplied-facts"
      : "provisional";

  return selected;
}

function appendOutcomeClaims(
  input: Input,
  references: Candidate[],
  selected: Candidate[],
  details: OutcomeDetails,
) {
  for (const candidate of references) {
    details.claims.push({
      text: `${candidate.name}: ${candidate.cultural ? "returned cultural association; inspect query scope and retrieval time" : "synthetic development association"}.`,
      basis: "retrieved-association",
      candidateIds: [candidate.id],
      evidenceIds: candidate.evidenceIds.filter((id) =>
        input.evidence.some(
          (evidence) =>
            evidence.id === id && isEvidenceKind(evidence, "cultural"),
        ),
      ),
    });

    if (selected.some((candidate) => candidate.id === candidate.id)) {
      details.claims.push({
        text: `${candidate.name}: $${candidate.cost.value}, ${candidate.duration.value} minutes, access supplied as available.`,
        basis: "supplied-fact",
        candidateIds: [candidate.id],
        evidenceIds: candidate.evidenceIds.filter((id) =>
          input.evidence.some(
            (evidence) =>
              evidence.id === id && isEvidenceKind(evidence, "practical"),
          ),
        ),
      });
    }
  }
}
