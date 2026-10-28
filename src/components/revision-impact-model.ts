import type { Task } from "../core/contracts";

type SavedDocument = NonNullable<Task["work"]>["documents"][number];

/** Pure projection of server-persisted work. Nothing here interprets the
 * user's wording or invents an entity, approval, evidence link or revision. */
export function readRevisionImpact(task: Task, document: SavedDocument) {
  const work = task.work;
  const previous = document.history.at(-1);
  const changed = Boolean(previous && previous.content !== document.content);
  const excerpt = (oldText: string, newText: string) => {
    let start = 0;
    while (
      start < oldText.length &&
      start < newText.length &&
      oldText[start] === newText[start]
    ) {
      start += 1;
    }
    const from = Math.max(0, start - 32);
    return {
      before: oldText.slice(from, Math.min(oldText.length, start + 110)),
      after: newText.slice(from, Math.min(newText.length, start + 110)),
    };
  };
  const difference = changed
    ? excerpt(previous!.content, document.content)
    : null;
  const confirmedBudget = work?.budget?.confirmed ? work.budget.amount : null;
  const retainedReferences = previous
    ? (task.agentRun?.requirements?.culturalReferences ?? []).filter(
        (reference) =>
          previous.content
            .toLocaleLowerCase()
            .includes(reference.toLocaleLowerCase()) &&
          document.content
            .toLocaleLowerCase()
            .includes(reference.toLocaleLowerCase()),
      )
    : [];
  const approvedElsewhere = [
    ...(work?.documents
      .filter((item) => item.id !== document.id && item.status === "approved")
      .map((item) => item.title) ?? []),
    ...(work?.decisions
      .filter((item) => item.id !== document.id && item.status === "approved")
      .map((item) => item.title) ?? []),
  ];
  const unresolved: string[] = [];
  if (document.conflict) unresolved.push(document.conflict);
  if (document.freshness === "stale") {
    unresolved.push("This document is stale after a dependent decision changed.");
  }
  if (
    confirmedBudget !== null &&
    task.brief.constraints.budget !== confirmedBudget
  ) {
    unresolved.push("Saved work and brief do not agree on the budget.");
  }
  for (const check of task.agentRun?.acceptance?.checks ?? []) {
    if (check.status !== "satisfied") {
      unresolved.push(check.requirement + " (" + check.status + ")");
    }
  }
  const provenance = task.evidence.filter(
    (item) =>
      document.evidenceIds.includes(item.id) &&
      item.kind === "cultural" &&
      item.freshness === "current",
  );
  return {
    documentId: document.id,
    version: document.version,
    previousVersion: previous?.version ?? null,
    changed,
    difference,
    confirmedBudget,
    approvedElsewhere,
    retainedReferences,
    unresolved: [...new Set(unresolved)].slice(0, 6),
    cultural: {
      live: provenance.filter(
        (item) => item.delivery === "LIVE" && item.source === "provider-returned",
      ).length,
      cached: provenance.filter((item) => item.delivery === "CACHED").length,
      unclassified: provenance.filter((item) => !item.delivery).length,
    },
  };
}
