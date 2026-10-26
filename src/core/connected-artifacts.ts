import type { Artifact } from "./contracts";

/** Locks preserve content; they never turn invalidated evidence into current evidence. */
export function reconcileGeneratedArtifact(
  next: Artifact,
  previous?: Artifact,
): Artifact {
  if (!previous) return next;

  const identical =
    previous.kind === next.kind &&
    previous.title === next.title &&
    previous.content === next.content &&
    JSON.stringify(previous.details ?? null) === JSON.stringify(next.details ?? null) &&
    JSON.stringify(previous.dependencies) === JSON.stringify(next.dependencies) &&
    JSON.stringify(previous.evidenceIds) === JSON.stringify(next.evidenceIds) &&
    JSON.stringify(previous.assumptions) === JSON.stringify(next.assumptions);

  if (previous.locked) {
    return {
      ...previous,
      freshness:
        previous.freshness === "current" && identical ? "current" : "stale",
    };
  }
  if (previous.freshness === "current" && identical) return previous;
  return next;
}

export function hasLockedConflict(artifacts: Artifact[]): boolean {
  return artifacts.some((a) => a.locked && a.freshness === "stale");
}
