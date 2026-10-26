import type { Artifact, Candidate, Task } from "../core/contracts";
import { reconcileGeneratedArtifact, hasLockedConflict, finalizeConnectedArtifacts } from "../core/connected-artifacts";
import { goalPolicies } from "../core/goals";
import { composeOutcome } from "./outcome-composer";
import { groupUtility } from "./collaborate";
import { isEvidenceKind } from "../core/evidence";

export type CompositionInput = Pick<
  Task,
  "brief" | "candidates" | "artifacts" | "evidence"
>;

export function compose(input: CompositionInput) {
  if (input.brief.outcome) {
    return composeOutcome(input);
  }

  const task = {
    ...structuredClone(input),
    schedule: [] as Task["schedule"],
    status: "ready" as "ready" | "partial",
  };
  const eligible = task.candidates.filter(
    (candidate) =>
      candidate.eligibility === "eligible" && candidate.freshness === "current",
  );
  const culturalEvidenceIds = new Set(
    task.evidence
      .filter((evidence) =>
        evidence.freshness === "current" &&
        isEvidenceKind(evidence, "cultural"),
      )
      .map((evidence) => evidence.id),
  );
  const culturalReferences = task.candidates.filter(
    (candidate) =>
      candidate.freshness === "current" &&
      candidate.evidenceIds.some((id) => culturalEvidenceIds.has(id)),
  );
  const culturallyGroundedArtists = culturalReferences
    .filter((candidate) => candidate.type === "artist")
    .sort((a, b) => groupUtility(b.fit) - groupUtility(a.fit))
    .slice(0, 3);
  let selected: Candidate[] = [];

  if (task.brief.kind === "gathering") {
    let utility = -Infinity;

    for (const film of eligible.filter((candidate) =>
      ["movie", "tv_show"].includes(candidate.type),
    )) {
      for (const music of [
        undefined,
        ...eligible.filter((candidate) => candidate.type === "artist"),
      ]) {
        const pair = music ? [film, music] : [film];
        const minutes =
          goalPolicies.gathering.movieOverhead +
          pair.reduce(
            (total, candidate) => total + (candidate.duration.value ?? 0),
            0,
          );
        const cost = pair.reduce(
          (total, candidate) => total + (candidate.cost.value ?? 0),
          0,
        );
        const value =
          groupUtility(film.fit) +
          (music ? groupUtility(music.fit) * 0.5 + 0.2 : 0);

        if (
          (task.brief.pinned ?? []).every((id) =>
            pair.some((candidate) => candidate.id === id),
          ) &&
          minutes <= task.brief.constraints.duration &&
          cost <= task.brief.constraints.budget &&
          value > utility
        ) {
          selected = pair;
          utility = value;
        }
      }
    }
  } else {
    let spent = 0;
    let referenceMinutes = 0;

    for (const candidate of eligible.sort(
      (a, b) => groupUtility(b.fit) - groupUtility(a.fit),
    )) {
      if (
        selected.length < goalPolicies[task.brief.kind].maxReferences &&
        spent + (candidate.cost.value ?? 0) <= task.brief.constraints.budget &&
        referenceMinutes + (candidate.duration.value ?? 0) <=
          task.brief.constraints.duration
      ) {
        selected.push(candidate);
        spent += candidate.cost.value ?? 0;
        referenceMinutes += candidate.duration.value ?? 0;
      }
    }

    if (task.brief.pinned?.length) {
      const pinned = task.brief.pinned.map((id) =>
        eligible.find((candidate) => candidate.id === id),
      );
      selected =
        pinned.every((candidate) => candidate !== undefined) &&
        pinned.reduce(
          (total, candidate) => total + (candidate?.cost.value ?? 0),
          0,
        ) <= task.brief.constraints.budget &&
        pinned.reduce(
          (total, candidate) => total + (candidate?.duration.value ?? 0),
          0,
        ) <= task.brief.constraints.duration
          ? (pinned as Candidate[])
          : [];
    }
  }

  task.brief.selected = selected.map((candidate) => candidate.id);
  task.schedule =
    task.brief.kind === "gathering" && selected.length
      ? [
          {
            label: "Arrive & settle in",
            minutes: goalPolicies.gathering.arrivalMinutes,
            candidateId: null,
          },
          ...selected.map((candidate) => ({
            label: ["movie", "tv_show"].includes(candidate.type)
              ? `Watch · ${candidate.name}`
              : `Listen · ${candidate.name}`,
            minutes: candidate.duration.value ?? 0,
            candidateId: candidate.id,
          })),
          {
            label: "Share impressions & close",
            minutes: goalPolicies.gathering.discussionMinutes,
            candidateId: null,
          },
        ]
      : [];
  const total = selected.reduce(
    (total, candidate) => total + (candidate.cost.value ?? 0),
    0,
  );
  const minutes = task.schedule.reduce(
    (total, segment) => total + segment.minutes,
    0,
  );
  const evidenceIds = [
    ...new Set([
      ...selected.flatMap((candidate) => candidate.evidenceIds),
      ...(task.brief.kind === "creative" && !selected.length
        ? culturalReferences.flatMap((candidate) =>
            candidate.evidenceIds.filter((id) => culturalEvidenceIds.has(id)),
          )
        : []),
    ]),
  ];
  const dependencies = [
    ...selected.map((candidate) => `candidate:${candidate.id}`),
    "goal",
    "budget",
    "duration",
    "location",
    "catalogue",
    "selection",
    ...task.brief.participants.map(
      (participant) => `preferences:${participant.id}`,
    ),
    ...evidenceIds,
  ];
  const warnings = selected.flatMap((candidate) =>
    task.brief.participants
      .filter((participant) => (candidate.fit[participant.id] ?? 0) < 0)
      .map(
        (participant) =>
          `${participant.name} has a conflicting preference for ${candidate.name}. Ask before committing.`,
      ),
  );
  const live = task.evidence.some(
    (evidence) => evidence.source === "provider-returned",
  );
  let content: string;

  if (!selected.length && task.brief.kind === "creative" && culturalReferences.length) {
    content = [
      "Cultural creative direction — provisional",
      ...culturalReferences.slice(0, 5).map(
        (candidate) => `${candidate.name}: ${candidate.description}`,
      ),
      "These are evidence-linked cultural references only. Costs, availability, licensing, and audience demand have not been established.",
    ].join("\n\n");
    task.status = "partial";
  } else if (!selected.length) {
    content =
      "No complete selection satisfies the confirmed constraints. Review the catalogue, supply missing facts or adjust the budget and time. No availability or price has been invented.";
    task.status = "partial";
  } else if (task.brief.kind === "creative") {
    content = `Creative direction\n\n${selected.map((candidate) => candidate.name).join(" × ")}\n\nUse ${selected[0].tags.slice(0, 3).join(", ")} as an exploratory direction. ${selected.map((candidate) => candidate.description).join(" ")}\n\nAudience: the confirmed profiles in this workspace. Cultural fit is an illustrative tag-based interpretation, not measured audience demand.\n\nDeliverables: a short visual or written treatment, a reference shortlist, and an invitation to give feedback.`;
  } else if (task.brief.kind === "discovery") {
    content = `A discovery path\n\n${selected.map((candidate, i) => `${i + 1}. ${candidate.name}: ${candidate.description}`).join("\n\n")}\n\nStart with one option and tell Igor what resonated. These connections are synthetic development examples, not live recommendations.`;
  } else {
    content = `An evening with a little common ground\n\n${selected[0].name} anchors the evening${selected[1] ? `, with ${selected[1].name} as a listening interlude` : ""}.\n\n${task.schedule.map((segment) => `${segment.minutes} min · ${segment.label}`).join("\n")}\n\n${minutes} of ${task.brief.constraints.duration} minutes · $${total} of $${task.brief.constraints.budget} sample group budget.\n\n${warnings.length ? warnings.join("\n") : "This balances explicit interests; it does not establish unanimous preference."}\n\nAll costs, durations, access and cultural associations are illustrative until replaced or verified.`;
  }

  if (live) {
    content = content
      .replaceAll("sample group budget", "supplied group budget")
      .replaceAll(
        "All costs, durations, access and cultural associations are illustrative until replaced or verified.",
        "Cultural candidates were returned by Qloo; costs, minutes and access were supplied by the user. Confirm before committing.",
      )
      .replaceAll(
        "Use  as an exploratory direction.",
        "Use the retrieved references as an exploratory direction.",
      )
      .replaceAll(
        "Cultural fit is an illustrative tag-based interpretation, not measured audience demand.",
        "Cultural fit uses retrieved Qloo evidence and disclosed rank-based compromise; audience demand has not been measured.",
      )
      .replaceAll(
        "These connections are synthetic development examples, not live recommendations.",
        "These references were returned by Qloo. Check their recorded retrieval times and LIVE/CACHED status; personal relevance is not guaranteed.",
      );
  }

  if (task.brief.contextAnchor) {
    content += `\n\nContext anchor: ${task.brief.contextAnchor.name}. This query reflects entity-to-entity cultural associations; personal relevance, atmosphere and commercial rights remain unverified.`;
  }

  const previous = task.artifacts;
  const make = (
    id: string,
    kind: Artifact["kind"],
    title: string,
    text: string,
    deps = dependencies,
    sources = evidenceIds,
  ): Artifact => {
    const prior = previous.find((a) => a.id === id);
    const effectiveDependencies = id === "invitation"
      ? [...new Set([...deps, "main", ...(task.brief.kind === "creative" && culturallyGroundedArtists.length > 0 ? ["sound"] : [])])]
      : deps;
    return reconcileGeneratedArtifact({
      id,
      kind,
      title,
      content: text,
      version: (prior?.version ?? 0) + 1,
      dependencies: effectiveDependencies,
      evidenceIds: sources,
      assumptions: [
        live
          ? "User-supplied planning facts; no booking or price verification."
          : "Sample catalogue facts; no booking or live price verification.",
        live
          ? "Group compromise uses per-query ranks and coverage, not a comparison of raw scores across queries."
          : "Group fit uses a disclosed tag-overlap heuristic.",
      ],
      freshness: "current",
      edited: false,
    }, prior);
  };
  task.artifacts = [
    make(
      "main",
      task.brief.kind === "creative"
        ? "creative-brief"
        : task.brief.kind === "discovery"
          ? "comparison"
          : "programme",
      task.brief.kind === "gathering"
        ? "The evening, considered"
        : task.brief.kind === "creative"
          ? "A direction to build on"
          : "Follow the connection",
      content,
    ),
    make(
      "invitation",
      "invitation",
      "A note to bring everyone together",
      (selected.length && task.brief.kind !== "gathering"
        ? `Here are references to ${task.brief.kind === "creative" ? "review for this creative direction" : "explore"}: ${selected.map((candidate) => candidate.name).join(", ")}. These are illustrative cultural associations, not guaranteed matches. Tell me what resonates or needs changing.`
        : selected.length
          ? `Hi everyone, let’s make a little time for ${selected[0].name}${selected[1] ? ` and a listening session with ${selected[1].name}` : ""}.\n\nWe’re planning ${task.brief.constraints.duration} minutes at ${task.brief.constraints.location}. The sample selection totals $${total} for the group. Please confirm access and practical costs before finalizing.\n\nBring your perspective. If this direction isn’t for you, say so. We can adjust it together.`
          : "The plan needs a feasible selection before an invitation can be finalized."
      )
        .replaceAll(
          "The sample selection totals",
          live
            ? "The supplied selection totals"
            : "The sample selection totals",
        )
        .replaceAll(
          "These are illustrative cultural associations, not guaranteed matches.",
          live
            ? "These are Qloo-returned references, not guaranteed personal matches."
            : "These are illustrative cultural associations, not guaranteed matches.",
        ),
    ),
  ];

  // An artist-backed sound direction is separate from the creative brief.
  // It is a cultural reference, not a real playlist or cleared music license.
  if (task.brief.kind === "creative") {
    const artists = culturallyGroundedArtists;
    if (artists.length) {
      const sources = [
        ...new Set(artists.flatMap((artist) =>
          artist.evidenceIds.filter((id) => culturalEvidenceIds.has(id)),
        )),
      ];
      task.artifacts.splice(1, 0, make(
        "sound",
        "music-direction",
        "The sound direction",
        [
          "Cultural references for the sound direction",
          ...artists.map((artist) => `${artist.name}: ${artist.description}`),
          "Cultural associations are not proof of song availability, playback rights, or audience demand.",
        ].join("\n\n"),
        [
          "goal",
          ...sources,
          ...task.brief.participants.map((p) => `preferences:${p.id}`),
        ],
        sources,
      ));
    }
  }

  task.artifacts = finalizeConnectedArtifacts(task.artifacts, previous);
  if (hasLockedConflict(task.artifacts)) task.status = "partial";

  return {
    selected: task.brief.selected,
    schedule: task.schedule,
    artifacts: task.artifacts,
    status: task.status,
  };
}
