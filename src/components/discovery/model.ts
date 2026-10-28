import type { Task } from "@/core/contracts";

export type DiscoveryCandidate = Task["candidates"][number];

export function currentCandidates(task: Task) {
  return task.candidates.filter(
    (candidate) => candidate.freshness === "current",
  );
}

export function sourceLabel(candidate: DiscoveryCandidate) {
  if (candidate.sample) {
    return "EXAMPLE";
  }

  const signals = Object.values(candidate.cultural ?? {});

  if (!signals.length) {
    return "SUPPLIED";
  }

  return signals.some((signal) => signal.delivery === "LIVE")
    ? "LIVE"
    : "CACHED";
}

export function seedNames(task: Task, candidate: DiscoveryCandidate) {
  const ids = new Set(
    Object.values(candidate.cultural ?? {}).flatMap((signal) => signal.seedIds),
  );
  const names = task.entities
    .filter(
      (entity) =>
        entity.status === "resolved" &&
        entity.providerId &&
        ids.has(entity.providerId),
    )
    .map((entity) => entity.name);

  if (
    task.brief.contextAnchor &&
    ids.has(task.brief.contextAnchor.providerId)
  ) {
    names.push(task.brief.contextAnchor.name);
  }

  return [...new Set(names)];
}

export function typeLabel(type: DiscoveryCandidate["type"]) {
  const labels = {
    movie: "Film",
    tv_show: "TV",
    artist: "Music",
    place: "Place",
    book: "Book",
    person: "Person",
  };

  return labels[type];
}
