import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OutcomeStore } from "../../src/data/outcome-store";
import { SqliteTaskStore, ConflictError } from "../../src/data/store";
import { freshTask } from "../../src/data/fixtures";
import { FixtureCulturalProvider } from "../../src/tools/fixture-provider";
import { runTurn } from "../../src/core/orchestrator";
import {
  collectionSourceChanged,
  outcomeSnapshot,
  exportMarkdown,
  OutputActionSchema,
  ReviewInputSchema,
} from "../../src/core/outcomes";
import { readBoundedJson } from "../../src/core/server-input";

async function ready() {
  const store = new SqliteTaskStore(":memory:");
  store.create(freshTask("task", "private-owner"));
  const task = await runTurn(
    store,
    "task",
    "private-owner",
    { type: "sample", version: 0 },
    undefined,
    new FixtureCulturalProvider(),
  );

  return { store, task };
}

afterEach(() => vi.unstubAllEnvs());

describe("Outcomes, memory and controlled collaboration", () => {
  it("exports evidence and freshness without owner, raw profiles, messages or execution traces", async () => {
    const { store, task } = await ready();

    try {
      task.messages.push({
        role: "user",
        text: "private-message-sentinel",
        at: new Date().toISOString(),
      });
      const snap = outcomeSnapshot(task, ["main"]);
      const text = JSON.stringify(snap);
      expect(text).not.toContain("private-owner");
      expect(text).not.toContain("private-message-sentinel");
      expect(snap).not.toHaveProperty("preferences");
      expect(snap).not.toHaveProperty("trace");
      expect(snap.evidence.length).toBeGreaterThan(0);
      expect(exportMarkdown(snap)).toContain("## Evidence");
      task.artifacts[0].freshness = "stale";
      expect(outcomeSnapshot(task, ["main"]).artifacts[0].freshness).toBe(
        "stale",
      );
      expect(() => outcomeSnapshot(task, ["main"], true)).toThrow("stale");

      for (const ids of [[], ["missing"], ["main", "main"]]) {
        expect(() => outcomeSnapshot(task, ids)).toThrow();
      }
    } finally {
      store.close();
    }
  });
  it("redacts configured credentials and bearer tokens from shared/exported documents", async () => {
    const { store, task } = await ready();

    try {
      vi.stubEnv("GEMINI_API_KEY", "synthetic-secret-for-export-test");
      task.artifacts[0].edited = true;
      task.artifacts[0].content =
        "Note: synthetic-secret-for-export-test Bearer synthetic-bearer-value";
      const exported = JSON.stringify(outcomeSnapshot(task, ["main"]));
      expect(exported).not.toContain("synthetic-secret-for-export-test");
      expect(exported).not.toContain("synthetic-bearer-value");
      expect(exported).toContain("[redacted]");
    } finally {
      store.close();
    }
  });
  it("persists frozen collections while enforcing ownership and candidate freshness", async () => {
    const { store, task } = await ready();
    const path = mkdtempSync(join(tmpdir(), "igor-outcomes-"));
    let db = new OutcomeStore(join(path, "data.sqlite"));

    try {
      const candidate = task.candidates[0];
      const c = db.collect(task, "Reference study", [candidate.id]);
      candidate.name = "Changed afterwards";
      expect(db.collections(task.brief.owner)[0].items[0].name).not.toBe(
        "Changed afterwards",
      );
      db.close();
      db = new OutcomeStore(join(path, "data.sqlite"));
      expect(db.collections(task.brief.owner)[0].id).toBe(c.id);
      expect(db.collections("stranger")).toEqual([]);
      expect(() => db.removeCollection("stranger", c.id)).toThrow();
      expect(() => db.collect(task, "x", ["invented"])).toThrow();
      candidate.freshness = "stale";
      expect(() => db.collect(task, "x", [candidate.id])).toThrow();
      db.removeCollection(task.brief.owner, c.id);
      expect(db.collections(task.brief.owner)).toEqual([]);
    } finally {
      db.close();
      store.close();
      rmSync(path, { recursive: true, force: true });
    }
  });
  it("reorders and annotates boards without changing evidence, and rejects stale board revisions", async () => {
    const { store, task } = await ready();
    const db = new OutcomeStore(":memory:");

    try {
      const ids = task.candidates.slice(0, 2).map((c) => c.id);
      const c = db.collect(task, "References", ids);
      const updated = db.updateCollection(
        task.brief.owner,
        c.id,
        "Direction board",
        "Owner-authored interpretation",
        [...ids].reverse(),
        1,
      );
      expect(updated.items.map((c) => c.id)).toEqual([...ids].reverse());
      expect(updated.evidence).toEqual(c.evidence);
      expect(updated.revision).toBe(2);
      expect(() =>
        db.updateCollection(task.brief.owner, c.id, "Stale", "", ids, 1),
      ).toThrow(ConflictError);
      expect(() =>
        db.updateCollection(
          task.brief.owner,
          c.id,
          "Invented",
          "",
          ["unknown", ids[0]],
          2,
        ),
      ).toThrow();
    } finally {
      db.close();
      store.close();
    }
  });
  it("stores review effects with the task so an accepted correction cannot execute twice", async () => {
    const { store, task } = await ready();

    try {
      const reviewId = "11111111-1111-4111-8111-111111111111";
      const updated = await runTurn(
        store,
        task.id,
        task.brief.owner,
        {
          type: "participant",
          participant: task.brief.participants[0],
          reviewId,
          version: task.brief.version,
        },
        undefined,
        new FixtureCulturalProvider(),
      );
      expect(store.load(task.id, task.brief.owner).reviewEffects).toContain(
        reviewId,
      );
      await expect(
        runTurn(
          store,
          task.id,
          task.brief.owner,
          {
            type: "participant",
            participant: updated.brief.participants[0],
            reviewId,
            version: updated.brief.version,
          },
          undefined,
          new FixtureCulturalProvider(),
        ),
      ).rejects.toThrow(ConflictError);
    } finally {
      store.close();
    }
  });
  it("preserves saved references across wording edits but detects affected decision changes", async () => {
    const { store, task } = await ready();
    const db = new OutcomeStore(":memory:");

    try {
      const c = db.collect(task, "References", [task.candidates[0].id]);
      const wording = await runTurn(
        store,
        task.id,
        task.brief.owner,
        {
          type: "artifact",
          artifactId: "invitation",
          content: "A different invitation.",
          version: task.brief.version,
        },
        undefined,
        new FixtureCulturalProvider(),
      );
      expect(collectionSourceChanged(c, wording)).toBe(false);
      const constrained = await runTurn(
        store,
        task.id,
        task.brief.owner,
        { type: "constraints", budget: 0, version: wording.brief.version },
        undefined,
        new FixtureCulturalProvider(),
      );
      expect(collectionSourceChanged(c, constrained)).toBe(true);
    } finally {
      db.close();
      store.close();
    }
  });
  it("uses revocable expiring bearer links and enforces comment-only permissions", async () => {
    const { store, task } = await ready();
    let time = new Date("2026-10-24T12:00:00Z");
    const db = new OutcomeStore(":memory:", () => time);

    try {
      const link = db.share(task, ["main"], null, 1);
      expect(db.shares(task.brief.owner, task.id)[0]).not.toHaveProperty(
        "token",
      );
      expect(db.reviewPage(link.token).snapshot).not.toHaveProperty("owner");
      expect(() =>
        db.review(link.token, {
          type: "preference",
          value: "Radiohead",
          polarity: "like",
        }),
      ).toThrow("comments only");
      const r = db.review(link.token, {
        type: "comment",
        text: "Can we shorten the programme?",
      });
      expect(db.getReview(task.brief.owner, r.id).accepted).toBe(false);
      expect(() => db.getReview("stranger", r.id)).toThrow();
      expect(task.brief.version).toBe(link.snapshot.sourceVersion);
      db.revoke(task.brief.owner, link.id);
      expect(() => db.reviewPage(link.token)).toThrow();
      const timed = db.share(task, ["main"], null, 1);
      time = new Date(time.getTime() + 86400001);
      expect(() => db.reviewPage(timed.token)).toThrow();
    } finally {
      db.close();
      store.close();
    }
  });
  it("attributes guest proposals to their assigned participant without automatically mutating the task", async () => {
    const { store, task } = await ready();
    const db = new OutcomeStore(":memory:");

    try {
      const original = structuredClone(task);
      const person = task.brief.participants[0];
      const link = db.share(task, ["main"], person.id, 1);
      const submitted = db.review(link.token, {
        type: "preference",
        value: "Kendrick Lamar",
        polarity: "not-now",
      });
      const review = db.getReview(task.brief.owner, submitted.id);
      expect(review.participantId).toBe(person.id);
      expect(review.proposal).toMatchObject({ polarity: "not-now" });
      expect(task).toEqual(original);
      expect(
        ReviewInputSchema.safeParse({
          type: "preference",
          value: "x",
          polarity: "like",
          participantId: "another",
          verified: true,
        }).success,
      ).toBe(false);
      db.accept(task.brief.owner, review.id);
      expect(() => db.accept(task.brief.owner, review.id)).toThrow();
    } finally {
      db.close();
      store.close();
    }
  });
  it("caps feedback and refuses privileged fields", async () => {
    const { store, task } = await ready();
    const db = new OutcomeStore(":memory:");

    try {
      const link = db.share(task, ["main"], null, 1);

      for (let i = 0; i < 30; i++) {
        db.review(link.token, { type: "comment", text: `Review ${i}` });
      }

      expect(() =>
        db.review(link.token, { type: "comment", text: "overflow" }),
      ).toThrow("limit");
      expect(
        ReviewInputSchema.safeParse({
          type: "comment",
          text: "x",
          tool: "fetch_url",
        }).success,
      ).toBe(false);
    } finally {
      db.close();
      store.close();
    }
  });
  it("requires a current actual comparison, hides arm assignment and retains no preference", async () => {
    const { store, task } = await ready();
    const db = new OutcomeStore(":memory:");

    try {
      expect(() => db.blind(task)).toThrow("current");
      task.evaluation = {
        version: task.brief.version,
        status: "ok",
        baseline: [task.candidates[0].id],
        assisted: [task.candidates[1].id],
        warnings: [],
        model: "test-model",
        at: new Date().toISOString(),
      };
      const pair = db.blind(task);
      expect(pair).not.toHaveProperty("aIsBaseline");
      expect(() =>
        db.assess(task.brief.owner, pair.id, task.brief.version + 1, {
          choice: "A",
          reason: "old",
        }),
      ).toThrow();
      const r = db.assess(task.brief.owner, pair.id, task.brief.version, {
        choice: "no-preference",
        reason: "Both remain operationally unverified.",
      });
      expect(r.response?.choice).toBe("no-preference");
      expect(r).toHaveProperty("aIsBaseline");
      expect(() =>
        db.assess(task.brief.owner, pair.id, task.brief.version, {
          choice: "B",
          reason: "again",
        }),
      ).toThrow();
    } finally {
      db.close();
      store.close();
    }
  });
  it("keeps owner memory authoritative across workspaces and never resurrects deletions", async () => {
    const { store, task } = await ready();

    try {
      const pref = task.brief.participants[0].preferences.find(
        (p) => p.confirmed,
      )!;
      const first = await runTurn(
        store,
        task.id,
        task.brief.owner,
        {
          type: "memory",
          operation: "save",
          preferenceId: pref.id,
          version: task.brief.version,
        },
        undefined,
        new FixtureCulturalProvider(),
      );
      expect(store.memory(task.brief.owner)).toHaveLength(1);
      store.create(freshTask("second", task.brief.owner));
      let second = store.load("second", task.brief.owner);
      expect(second.preferences).toHaveLength(1);
      const target = second.brief.participants[1];
      const before = structuredClone(second.brief.participants);
      second = await runTurn(
        store,
        second.id,
        second.brief.owner,
        {
          type: "recall",
          preferenceId: pref.id,
          participantId: target.id,
          version: second.brief.version,
        },
        undefined,
        new FixtureCulturalProvider(),
      );
      expect(
        second.brief.participants[1].preferences.some(
          (p) =>
            p.value === pref.value &&
            p.scope === "participant" &&
            p.subject === target.id,
        ),
      ).toBe(true);
      expect(second.brief.participants[0]).toEqual(before[0]);
      await runTurn(
        store,
        first.id,
        first.brief.owner,
        {
          type: "memory",
          operation: "delete",
          preferenceId: pref.id,
          version: first.brief.version,
        },
        undefined,
        new FixtureCulturalProvider(),
      );
      expect(store.load(second.id, second.brief.owner).preferences).toEqual([]);
      second.brief.version++;
      store.save(second, second.brief.version - 1, second.brief.owner);
      expect(store.memory(second.brief.owner)).toEqual([]);
      expect(store.memory("stranger")).toEqual([]);
    } finally {
      store.close();
    }
  });
  it("migrates legacy memory without validating old decision shapes, and marks old outputs stale", async () => {
    const { store, task } = await ready();
    const dir = mkdtempSync(join(tmpdir(), "igor-legacy-"));
    const path = join(dir, "legacy.sqlite");

    try {
      const raw = JSON.parse(JSON.stringify(task));
      delete raw.candidates[0].dependencies;
      raw.preferences = [
        {
          ...raw.brief.participants[0].preferences[0],
          confirmed: true,
          scope: "persistent",
        },
      ];
      const legacy = new DatabaseSync(path);
      legacy.exec(
        "CREATE TABLE tasks(id TEXT PRIMARY KEY,owner TEXT,version INTEGER,state TEXT)",
      );
      legacy
        .prepare("INSERT INTO tasks VALUES(?,?,?,?)")
        .run(raw.id, raw.brief.owner, raw.brief.version, JSON.stringify(raw));
      legacy.close();
      const migrated = new SqliteTaskStore(path);

      try {
        const loaded = migrated.load(task.id, task.brief.owner);
        expect(migrated.memory(task.brief.owner)).toHaveLength(1);
        expect(loaded.candidates.every((c) => c.freshness === "stale")).toBe(
          true,
        );
        expect(loaded.artifacts.every((a) => a.freshness === "stale")).toBe(
          true,
        );
        expect(loaded.brief.selected).toEqual([]);
        expect(loaded.brief.goal).toBe(task.brief.goal);
        expect(migrated.list(task.brief.owner)).toHaveLength(1);
      } finally {
        migrated.close();
      }
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("rolls memory changes back when a task version loses a concurrency race", () => {
    const store = new SqliteTaskStore(":memory:");

    try {
      const task = freshTask("t", "o");
      store.create(task);
      const pref = {
        ...task.brief.participants[0].preferences[0],
        scope: "persistent" as const,
        confirmed: true,
      };
      expect(() =>
        store.save(task, 99, "o", { operation: "save", preference: pref }),
      ).toThrow(ConflictError);
      expect(store.memory("o")).toEqual([]);
    } finally {
      store.close();
    }
  });
  it("bounds chunked request bodies and rejects malformed JSON", async () => {
    const request = (body: string) =>
      new Request("http://localhost/", { method: "POST", body });
    await expect(
      readBoundedJson(request("x".repeat(10001)), 10000),
    ).rejects.toThrow("large");
    await expect(readBoundedJson(request("{broken"))).rejects.toThrow();
    expect(
      await readBoundedJson(request('{"type":"comment","text":"ok"}')),
    ).toEqual({ type: "comment", text: "ok" });
  });
  it("rejects unbounded and unauthorized output actions", () => {
    for (const input of [
      { type: "share", version: 1, artifactIds: ["main"], expiresInDays: 8 },
      { type: "share", version: 1, artifactIds: ["main"], tool: "email" },
      {
        type: "assessment",
        version: 1,
        id: "x",
        choice: "approve",
        reason: "x",
      },
    ]) {
      expect(OutputActionSchema.safeParse(input).success).toBe(false);
    }
  });
});
