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

/**
 * Never silently delete previously approved work when the planner's next
 * output set changes. Stale approvals remain inspectable until a user
 * deliberately unlocks or supersedes them. Derived nodes cannot be current
 * while one of their locked inputs requires review.
 */
export function finalizeConnectedArtifacts(
  generated: Artifact[],
  previous: Artifact[],
): Artifact[] {
  const ids = new Set(generated.map((a) => a.id));
  const combined = [
    ...generated,
    ...previous
      .filter((a) => a.locked && !ids.has(a.id))
      .map((a) => ({ ...a, freshness: "stale" as const })),
  ];
  const staleLocks = new Set(
    combined
      .filter((a) => a.locked && a.freshness === "stale")
      .map((a) => a.id),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const artifact of combined) {
      if (
        artifact.freshness === "current" &&
        artifact.dependencies.some((id) => staleLocks.has(id))
      ) {
        artifact.freshness = "stale";
        staleLocks.add(artifact.id);
        changed = true;
      }
    }
  }
  return combined;
}
