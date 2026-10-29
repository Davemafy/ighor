import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { messageIds } from "../core/agent-events";
import { updateConversationFocus } from "../core/conversation-focus";
import { TaskSchema, PreferenceSchema, type Task, type Turn, type Event } from "../core/contracts";

export class AccessError extends Error {
  code = "not-found";
}

export class ConflictError extends Error {
  code = "conflict";
}

export class TurnIdReuseError extends Error {
  code = "turn-id-reuse";
}

export type JournalTurn = {
  turnId: string;
  status: "accepted" | "running" | "completed" | "failed" | "superseded" | "interrupted";
  acceptedVersion: number;
  updatedAt: string;
  events: Array<{ sequence: number; event: Event }>;
};

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
    // Additive journal migration: existing JSON task rows remain authoritative.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS turns (
        workspace TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        accepted_version INTEGER NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(workspace,turn_id)
      );
      CREATE TABLE IF NOT EXISTS turn_events (
        workspace TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_json TEXT NOT NULL,
        PRIMARY KEY(workspace,turn_id,sequence)
      );
    `);
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

  /**
   * Atomic admission point: reserve a stable client turn ID and persist the
   * user's message before starting paid inference. A duplicate key cannot
   * repeat the provider call, even if the previous request lost its stream.
   */
  acceptTurn(
    id: string,
    owner: string,
    turnId: string,
    input: Turn,
  ): { duplicate: boolean; acceptedVersion: number } {
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    this.db.exec("BEGIN IMMEDIATE");

    try {
      const row = this.db
        .prepare("SELECT state,version FROM tasks WHERE id=? AND owner=?")
        .get(id, owner) as { state: string; version: number } | undefined;

      if (!row) {
        throw new AccessError("Workspace not found.");
      }

      const previous = this.db
        .prepare("SELECT payload_hash,accepted_version FROM turns WHERE workspace=? AND turn_id=?")
        .get(id, turnId) as
        | { payload_hash: string; accepted_version: number }
        | undefined;

      if (previous) {
        if (previous.payload_hash !== hash) {
          throw new TurnIdReuseError("Turn ID already belongs to a different request.");
        }

        this.db.exec("COMMIT");

        return {
          duplicate: true,
          acceptedVersion: previous.accepted_version,
        };
      }

      if (row.version !== input.version) {
        throw new ConflictError("A newer correction is already saved.");
      }

      const task = readStoredState(row.state);
      const next = row.version + 1;

      // Preserve every accepted message in the existing read model, not only
      // in the journal, so reload immediately shows the pending user turn.
      if (input.type === "message") {
        task.messages.push({
          role: "user",
          kind: "conversation",
          text: input.text,
          at: new Date().toISOString(),
        });
      }

      task.brief.version = next;
      updateConversationFocus(task);
      messageIds(task);
      TaskSchema.parse(task);
      this.db.prepare(
        "UPDATE tasks SET state=?, version=? WHERE id=? AND owner=? AND version=?",
      ).run(JSON.stringify(task), next, id, owner, row.version);
      this.db.prepare(
        "INSERT INTO turns (workspace,turn_id,payload_hash,accepted_version,status,updated_at) VALUES (?,?,?,?,?,?)",
      ).run(id, turnId, hash, next, "accepted", new Date().toISOString());

      this.db.exec("COMMIT");

      return { duplicate: false, acceptedVersion: next };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Record replayable UI events without incrementing task revision. */
  recordTurnEvent(id: string, owner: string, turnId: string, event: Event) {
    this.db.exec("BEGIN IMMEDIATE");

    try {
      const ownership = this.db
        .prepare("SELECT 1 FROM tasks WHERE id=? AND owner=?")
        .get(id, owner);

      if (!ownership) {
        throw new AccessError("Workspace not found.");
      }

      const row = this.db
        .prepare("SELECT status FROM turns WHERE workspace=? AND turn_id=?")
        .get(id, turnId) as { status: string } | undefined;

      if (!row) {
        throw new AccessError("Turn not found.");
      }

      if (["completed", "failed", "superseded"].includes(row.status)) {
        this.db.exec("COMMIT");

        return;
      }

      const next = (
        this.db
          .prepare("SELECT COALESCE(MAX(sequence),0)+1 AS seq FROM turn_events WHERE workspace=? AND turn_id=?")
          .get(id, turnId) as { seq: number }
      ).seq;
      this.db.prepare(
        "INSERT INTO turn_events (workspace,turn_id,sequence,event_json) VALUES (?,?,?,?)",
      ).run(id, turnId, next, JSON.stringify(event));

      const status =
        event.type === "done"
          ? event.task.status === "error" ? "failed" : "completed"
          : event.type === "error"
            ? event.code === "conflict" ? "superseded" : "failed"
            : "running";

      this.db.prepare(
        "UPDATE turns SET status=?, updated_at=? WHERE workspace=? AND turn_id=?",
      ).run(status, new Date().toISOString(), id, turnId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  readTurn(
    id: string,
    owner: string,
    turnId: string,
    afterSequence = 0,
  ): JournalTurn {
    if (!this.db
      .prepare("SELECT 1 FROM tasks WHERE id=? AND owner=?")
      .get(id, owner)) {
      throw new AccessError("Workspace not found.");
    }

    const row = this.db
      .prepare("SELECT accepted_version,status,updated_at FROM turns WHERE workspace=? AND turn_id=?")
      .get(id, turnId) as
      | { accepted_version: number; status: JournalTurn["status"]; updated_at: string }
      | undefined;

    if (!row) {
      throw new AccessError("Turn not found.");
    }

    const events = this.db
      .prepare("SELECT sequence,event_json FROM turn_events WHERE workspace=? AND turn_id=? AND sequence>? ORDER BY sequence ASC LIMIT 150")
      .all(id, turnId, afterSequence)
      .map((item) => ({
        sequence: Number(item.sequence),
        event: JSON.parse(String(item.event_json)) as Event,
      }));

    return {
      turnId,
      status:
        ["accepted", "running"].includes(row.status) &&
        Date.now() - Date.parse(row.updated_at) > 120000
          ? "interrupted"
          : row.status,
      acceptedVersion: row.accepted_version,
      updatedAt: row.updated_at,
      events,
    };
  }

  create(task: Task) {
    updateConversationFocus(task);
    messageIds(task);
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
      .prepare("SELECT state FROM memory WHERE owner=? ORDER BY rowid")
      .all(owner)
      .map((r) => PreferenceSchema.parse(JSON.parse(String(r.state))));
  }

  save(task: Task, expected: number, owner: string, change?: MemoryChange) {
    updateConversationFocus(task);
    messageIds(task);
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
          !count.some((saved) => saved.id === preference.id)
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

  const task = TaskSchema.parse(raw);

  // A crashed server cannot resume a timed-out Bright Data HTTP request.
  // Show an honest recoverable state on reload instead of leaving the
  // workspace indefinitely "running". Do not mutate the stored version:
  // an in-flight worker can still commit if its optimistic CAS succeeds.
  const lastTrace = task.trace.at(-1);

  if (
    task.status === "running" &&
    lastTrace?.action === "tool.invoke:search_web" &&
    Number.isFinite(Date.parse(lastTrace.at)) &&
    Date.now() - Date.parse(lastTrace.at) > 120000
  ) {
    task.status = "partial";
    task.error =
      "Live research was interrupted before an answer was confirmed. Your request and earlier work are saved; retry research to continue.";
  }

  // Persisted agent steps are authoritative after a crash. Do not replay a
  // possibly completed paid call automatically; expose the interruption and
  // let a new user turn continue from the saved observations.
  if (
    task.agentRun &&
    [
      "created",
      "reasoning",
      "executing_tool",
      "observing",
      "verifying",
    ].includes(task.agentRun.status) &&
    Number.isFinite(Date.parse(task.agentRun.updatedAt)) &&
    Date.now() - Date.parse(task.agentRun.updatedAt) > 120000
  ) {
    task.agentRun.status = "interrupted";
    task.status = "partial";
    task.error =
      "Agent execution was interrupted. Completed observations are saved; no external action was automatically repeated.";
  }

  messageIds(task);

  return task;
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
