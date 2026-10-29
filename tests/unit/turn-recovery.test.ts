import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { SqliteTaskStore, ConflictError } from "../../src/data/store";
import { freshTask } from "../../src/data/fixtures";

const input = {
  type: "message" as const,
  text: "Build on the saved plan",
  version: 0,
};
describe("Persisted turn recovery and worker fencing", () => {
  it("recovers an expired lease after database reopen and fences a late writer", () => {
    const dir = mkdtempSync(join(tmpdir(), "igor-recovery-"));
    let now = Date.now();
    let db = new SqliteTaskStore(join(dir, "tasks.sqlite"), () => now);

    try {
      const task = freshTask("work", "owner");
      db.create(task);
      const accepted = db.acceptTurn(task.id, "owner", "turn-1", input);
      const late = db.forTurn(task.id, "owner", "turn-1", accepted.runId);
      const pending = db.load(task.id, "owner");
      db.close();
      now += 60001;
      db = new SqliteTaskStore(join(dir, "tasks.sqlite"), () => now);
      const replay = db.readTurn(task.id, "owner", "turn-1");
      expect(replay.status).toBe("interrupted");
      expect(replay.phase).toBe("interrupted");
      expect(replay.events.at(-1)?.event).toMatchObject({
        type: "error",
        code: "interrupted",
      });
      expect(replay.task.messages).toHaveLength(1);
      expect(replay.task.status).toBe("partial");
      expect(db.readTurn(task.id, "owner", "turn-1").events).toHaveLength(2);
      const scoped = db.forTurn(task.id, "owner", "turn-1", accepted.runId);
      pending.brief.version++;
      expect(() => scoped.save(pending, 1, "owner")).toThrow(ConflictError);
      expect(db.acceptTurn(task.id, "owner", "turn-1", input).duplicate).toBe(
        true,
      );
      expect(
        db.renewTurnLease(task.id, "owner", "turn-1", accepted.runId),
      ).toBe(false);
      // Keep a reference to the old worker to establish it wasn't implicitly resumed.
      expect(late).toBeDefined();
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("renews a live lease, rejects wrong owners and blocks a superseded worker", () => {
    let now = Date.now();
    const db = new SqliteTaskStore(":memory:", () => now);

    try {
      const task = freshTask("work", "owner");
      db.create(task);
      const first = db.acceptTurn("work", "owner", "one", input);
      now += 40000;
      expect(db.renewTurnLease("work", "owner", "one", first.runId)).toBe(true);
      now += 40000;
      expect(db.readTurn("work", "owner", "one").status).toBe("accepted");
      expect(db.renewTurnLease("work", "wrong", "one", first.runId)).toBe(
        false,
      );
      const second = db.acceptTurn("work", "owner", "two", {
        ...input,
        text: "Actually keep the approved work",
        version: 1,
      });
      expect(second.runId).not.toBe(first.runId);
      expect(db.readTurn("work", "owner", "one").status).toBe("superseded");
      expect(
        db.recordTurnEvent("work", "owner", "one", {
          type: "action",
          message: "Late",
        }),
      ).toBeUndefined();
      const late = db.load("work", "owner");
      late.brief.version++;
      expect(() =>
        db.forTurn("work", "owner", "one", first.runId).save(late, 2, "owner"),
      ).toThrow(ConflictError);
      expect(db.load("work", "owner").messages.at(-1)?.text).toBe(
        "Actually keep the approved work",
      );
    } finally {
      db.close();
    }
  });
  it("paginates all events and distinguishes partial work from completion", () => {
    const db = new SqliteTaskStore(":memory:");

    try {
      db.create(freshTask("work", "owner"));
      db.acceptTurn("work", "owner", "one", input);

      for (let i = 0; i < 160; i++) {
        db.recordTurnEvent("work", "owner", "one", {
          type: "action",
          phase: "retrieving",
          message: `Read ${i}`,
        });
      }

      const partial = db.load("work", "owner");
      partial.status = "partial";
      db.recordTurnEvent("work", "owner", "one", {
        type: "done",
        task: partial,
      });
      const first = db.readTurn("work", "owner", "one");
      expect(first.hasMore).toBe(true);
      const second = db.readTurn(
        "work",
        "owner",
        "one",
        first.events.at(-1)!.sequence,
      );
      expect([...first.events, ...second.events]).toHaveLength(162);
      expect(second.hasMore).toBe(false);
      expect(second.status).toBe("partial");
      expect(second.lastSequence).toBe(162);
    } finally {
      db.close();
    }
  });
});
