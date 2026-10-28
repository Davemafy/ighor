import { describe, expect, it } from "vitest";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";

describe("interrupted research presentation", () => {
  function example(ageMs: number, action = "tool.invoke:search_web") {
    const task = freshTask(`recovery-${ageMs}`, "owner");
    task.status = "running";
    task.messages.push({
      role: "user",
      text: "Find a current public source",
      at: new Date(Date.now() - ageMs).toISOString(),
    });
    task.trace.push({
      id: `research-${ageMs}`,
      action,
      outcome: "Searching public sources.",
      requests: 0,
      version: 0,
      evidenceIds: [],
      durationMs: 0,
      at: new Date(Date.now() - ageMs).toISOString(),
    });

    return task;
  }

  it("shows stale in-flight research as recoverable without dropping the user turn", () => {
    const store = new SqliteTaskStore(":memory:");

    try {
      const task = example(180000);
      store.create(task);
      const loaded = store.load(task.id, "owner");
      expect(loaded.status).toBe("partial");
      expect(loaded.error).toContain("interrupted");
      expect(loaded.messages.at(-1)?.text).toBe("Find a current public source");
      expect(loaded.trace).toHaveLength(task.trace.length);
      expect(loaded.brief.version).toBe(task.brief.version);
      expect(loaded.evidence).toEqual(task.evidence);
      // The read-only recovery does not race against a possibly completing
      // worker's optimistic commit. A new user request can save normally.
      loaded.brief.version++;
      store.save(loaded, task.brief.version, "owner");
      expect(store.load(task.id, "owner").status).toBe("partial");
    } finally {
      store.close();
    }
  });

  it("does not interrupt active requests or unrelated long-running work", () => {
    const store = new SqliteTaskStore(":memory:");

    try {
      const active = example(1000);
      const cultural = example(180000, "cultural.discover");
      cultural.id = "unrelated-cultural-work";
      store.create(active);
      store.create(cultural);
      expect(store.load(active.id, "owner").status).toBe("running");
      expect(store.load(cultural.id, "owner").status).toBe("running");
    } finally {
      store.close();
    }
  });
});
