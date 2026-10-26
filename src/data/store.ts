import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { TaskSchema, PreferenceSchema, type Task } from "../core/contracts";

export class AccessError extends Error {
  code = "not-found";
}

export class ConflictError extends Error {
  code = "conflict";
}

type Preference = Task["preferences"][number];

export type MemoryChange =
  | { operation: "save"; preference: Preference }
  | { operation: "delete"; id: string };

export interface TaskStore {
  create(task: Task): void;
  load(id: string, owner: string): Task;
  save(
    task: Task,
    expected: number,
    owner: string,
    memoryChange?: MemoryChange,
  ): void;
  memory(owner: string): Preference[];
  list(owner: string): Task[];
}

export class SqliteTaskStore implements TaskStore {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.db = new DatabaseSync(path);
    this.db.exec(
      `PRAGMA journal_mode=WAL;
       PRAGMA busy_timeout=5000;
       CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, owner TEXT NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL);
       CREATE TABLE IF NOT EXISTS memory (owner TEXT NOT NULL, id TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(owner,id))`,
    );
    // One-time migration of explicitly saved preferences from the latest legacy
    // workspace per owner. A marker prevents forgotten memories reappearing.
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS store_meta (key TEXT PRIMARY KEY)",
    );

    if (
      !this.db.prepare("SELECT key FROM store_meta WHERE key='memory-v1'").get()
    ) {
      this.db.exec("BEGIN IMMEDIATE");

      try {
        const previous = this.db
          .prepare(
            "SELECT state FROM tasks WHERE rowid IN (SELECT MAX(rowid) FROM tasks GROUP BY owner)",
          )
          .all();

        for (const row of previous) {
          const task = z
            .object({
              brief: z.object({ owner: z.string() }),
              preferences: PreferenceSchema.array(),
            })
            .parse(JSON.parse(String(row.state)));

          for (const preference of task.preferences.filter(
            (preference) =>
              preference.confirmed && preference.scope === "persistent",
          )) {
            this.db
              .prepare("INSERT OR IGNORE INTO memory VALUES(?,?,?)")
              .run(task.brief.owner, preference.id, JSON.stringify(preference));
          }
        }

        this.db.prepare("INSERT INTO store_meta VALUES('memory-v1')").run();
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  create(task: Task) {
    TaskSchema.parse(task);
    this.db
      .prepare("INSERT INTO tasks VALUES(?,?,?,?)")
      .run(task.id, task.brief.owner, task.brief.version, JSON.stringify(task));
  }

  load(id: string, owner: string): Task {
    const row = this.db
      .prepare("SELECT state FROM tasks WHERE id=? AND owner=?")
      .get(id, owner);

    if (!row) {
      throw new AccessError("Workspace not found.");
    }

    const task = readStoredState(String(row.state));
    task.preferences = this.memory(owner);

    return task;
  }

  memory(owner: string) {
    return this.db
      .prepare(
        "SELECT state FROM memory WHERE owner=? ORDER BY rowid LIMIT 100",
      )
      .all(owner)
      .map((r) => PreferenceSchema.parse(JSON.parse(String(r.state))));
  }

  save(task: Task, expected: number, owner: string, change?: MemoryChange) {
    TaskSchema.parse(task);

    if (task.brief.owner !== owner) {
      throw new AccessError("Workspace not found.");
    }

    this.db.exec("BEGIN IMMEDIATE");

    try {
      if (change?.operation === "save") {
        const preference = PreferenceSchema.parse(change.preference);

        if (preference.scope !== "persistent" || !preference.confirmed) {
          throw new Error("Explicit confirmed memory required.");
        }

        const count = this.memory(owner);

        if (
          count.length >= 100 &&
          !count.some((preference) => preference.id === preference.id)
        ) {
          throw new Error("Memory limit reached.");
        }

        this.db
          .prepare(
            "INSERT INTO memory VALUES(?,?,?) ON CONFLICT(owner,id) DO UPDATE SET state=excluded.state",
          )
          .run(owner, preference.id, JSON.stringify(preference));
      } else if (change) {
        this.db
          .prepare("DELETE FROM memory WHERE owner=? AND id=?")
          .run(owner, change.id);
      }

      task.preferences = this.memory(owner);
      const row = this.db
        .prepare(
          "UPDATE tasks SET state=?, version=? WHERE id=? AND owner=? AND version=?",
        )
        .run(
          JSON.stringify(task),
          task.brief.version,
          task.id,
          owner,
          expected,
        );

      if (!row.changes) {
        this.load(task.id, owner);
        throw new ConflictError(
          "A newer correction is already saved. Reload the latest workspace.",
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  list(owner: string) {
    return this.db
      .prepare(
        "SELECT state FROM tasks WHERE owner=? ORDER BY rowid DESC LIMIT 20",
      )
      .all(owner)
      .map((r) => readStoredState(String(r.state)));
  }

  close() {
    this.db.close();
  }
}

/** Conservative read migration: old decisions never acquire current status by default. */
function readStoredState(text: string): Task {
  const raw = JSON.parse(text);

  if (
    Array.isArray(raw.candidates) &&
    raw.candidates.some(
      (c: { dependencies?: unknown }) => !Array.isArray(c.dependencies),
    )
  ) {
    const dependencies = [
      "goal",
      "budget",
      "duration",
      "location",
      "catalogue",
      "selection",
      ...(raw.brief?.participants ?? []).map(
        (p: { id: string }) => `preferences:${p.id}`,
      ),
    ];
    raw.candidates = raw.candidates.map((c: Record<string, unknown>) => ({
      ...c,
      dependencies: Array.isArray(c.dependencies)
        ? c.dependencies
        : dependencies,
      freshness: "stale",
    }));
    raw.evidence = (raw.evidence ?? []).map((e: Record<string, unknown>) => ({
      ...e,
      freshness: "stale",
    }));
    raw.artifacts = (raw.artifacts ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      freshness: "stale",
    }));
    raw.brief.selected = [];
    raw.schedule = [];
    raw.status = "partial";
    raw.error =
      "This saved workspace uses an earlier evidence schema. Refresh its decisions before use.";
  }

  return TaskSchema.parse(raw);
}

const globalStore = globalThis as typeof globalThis & {
  igorStore?: SqliteTaskStore;
};

export function getStore() {
  if (!globalStore.igorStore) {
    globalStore.igorStore = new SqliteTaskStore(
      process.env.IGOR_DB_PATH ?? `${process.cwd()}/.igor/workspace.sqlite`,
    );
  }

  return globalStore.igorStore;
}
