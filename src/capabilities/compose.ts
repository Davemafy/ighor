import type { Artifact, Candidate, Task } from "../core/contracts";
import { goalPolicies } from "../core/goals";
import { composeOutcome } from "./outcome-composer";
import { groupUtility } from "./collaborate";

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
    ...new Set(selected.flatMap((candidate) => candidate.evidenceIds)),
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

  if (!selected.length) {
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
  ): Artifact => ({
    id,
    kind,
    title,
    content: text,
    version: (previous.find((a) => a.id === id)?.version ?? 0) + 1,
    dependencies: deps,
    evidenceIds,
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
  });
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

  return {
    selected: task.brief.selected,
    schedule: task.schedule,
    artifacts: task.artifacts,
    status: task.status,
  };
}
