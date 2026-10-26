import type { Task, Artifact } from "./contracts";

/** Keep unregenerated documents and archive replaced versions, including manual wording. */
export function mergeArtifacts(
  previous: Artifact[],
  generated: Artifact[],
): Artifact[] {
  const incoming = new Map(generated.map((a) => [a.id, a]));
  const merged = previous.map((old) => {
    const next = incoming.get(old.id);
    incoming.delete(old.id);

    if (!next) {
      return old;
    }

    if (old.edited && old.content !== next.content) {
      return {
        ...old,
        freshness: "stale" as const,
        assumptions: [
          ...new Set([
            ...old.assumptions,
            "Inputs changed. Your manual wording was preserved; review before reuse.",
          ]),
        ],
      };
    }

    return next;
  });

  return [...merged, ...incoming.values()];
}

export function recordArtifactChanges(task: Task, previous: Artifact[]) {
  const history = [...(task.artifactHistory ?? [])];

  for (const old of previous) {
    const next = task.artifacts.find((a) => a.id === old.id);

    if (
      next &&
      (next.version !== old.version || next.content !== old.content)
    ) {
      history.push({
        artifact: old,
        at: new Date().toISOString(),
        reason: "Revised working output",
      });
    }
  }

  task.artifactHistory = history;
}
