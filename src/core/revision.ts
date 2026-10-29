import type { Task } from "./contracts";

/** Small fixed-point traversal; record order and prior staleness cannot hide descendants. */
export function invalidate(
  task: Task,
  changed: string[],
  includeWork = true,
): string[] {
  const affected = new Set(changed);
  const marked = new Set<string>();
  const records: Array<{
    id: string;
    record: {
      freshness?: "current" | "stale";
      status?: string;
      edited?: boolean;
      conflict?: string | null;
    };
    dependencies: string[];
  }> = [
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

  for (const decision of (includeWork ? task.work?.decisions : []) ?? []) {
    records.push({
      id: `decision:${decision.id}`,
      record: decision,
      dependencies: [...decision.dependencies, ...decision.evidenceIds],
    });
  }

  for (const document of (includeWork ? task.work?.documents : []) ?? []) {
    records.push({
      id: `document:${document.id}`,
      record: document,
      dependencies: [...document.dependencies, ...document.evidenceIds],
    });
  }

  let expanded = true;

  while (expanded) {
    expanded = false;

    for (const node of records) {
      if (node.dependencies.some((id) => affected.has(id))) {
        node.record.freshness = "stale";

        if (
          "status" in node.record &&
          (node.record.status === "approved" ||
            ("edited" in node.record && node.record.edited))
        ) {
          node.record.conflict =
            "An input changed. Approved or edited content is preserved; review the affected decision.";
        }

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
