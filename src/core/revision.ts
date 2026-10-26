import type { Task } from "./contracts";

/** Small fixed-point traversal; record order and prior staleness cannot hide descendants. */
export function invalidate(task: Task, changed: string[]): string[] {
  const affected = new Set(changed);
  const marked = new Set<string>();
  const records = [
    ...task.evidence.map((evidence) => ({
      id: evidence.id,
      record: evidence,
      dependencies: evidence.dependencies,
    })),
    ...task.candidates.map((candidate) => ({
      id: `candidate:${candidate.id}`,
      record: candidate,
      dependencies: [...candidate.dependencies, ...candidate.evidenceIds],
    })),
    ...task.artifacts.map((a) => ({
      id: a.id,
      record: a,
      dependencies: [...a.dependencies, ...a.evidenceIds],
    })),
  ];
  let expanded = true;

  while (expanded) {
    expanded = false;

    for (const node of records) {
      if (node.dependencies.some((id) => affected.has(id))) {
        node.record.freshness = "stale";
        marked.add(node.id);

        if (!affected.has(node.id)) {
          affected.add(node.id);
          expanded = true;
        }
      }
    }
  }

  return [...marked];
}
