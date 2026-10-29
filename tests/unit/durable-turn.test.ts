import { afterEach, describe, expect, it } from "vitest";
import { SqliteTaskStore, ConflictError, TurnIdReuseError } from "../../src/data/store";
import { freshTask } from "../../src/data/fixtures";
import { runTurn } from "../../src/core/orchestrator";

const owner = "owner";
const firstId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Durable accepted turn journal", () => {
  const databases: SqliteTaskStore[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.close();
    }
  });

  function setup() {
    const db = new SqliteTaskStore(":memory:");
    databases.push(db);
    const task = freshTask("journal-workspace", owner);
    db.create(task);

    return { db, task };
  }

  it("atomically accepts and saves a message before model inference", () => {
    const { db, task } = setup();
    const input = {
      type: "message" as const,
      text: "Plan a gathering for six friends",
      version: task.brief.version,
    };
    const accepted = db.acceptTurn(task.id, owner, firstId, input);

    expect(accepted).toEqual({ duplicate: false, acceptedVersion: 1 });
    expect(db.load(task.id, owner).messages.at(-1)).toMatchObject({
      role: "user",
      text: input.text,
    });
    expect(db.readTurn(task.id, owner, firstId)).toMatchObject({
      status: "accepted",
      acceptedVersion: 1,
      events: [],
    });
    expect(db.acceptTurn(task.id, owner, firstId, input)).toEqual({
      duplicate: true,
      acceptedVersion: 1,
    });
    expect(db.load(task.id, owner).messages).toHaveLength(1);
    expect(() =>
      db.acceptTurn(task.id, owner, firstId, {
        ...input,
        text: "A different paid instruction",
      }),
    ).toThrow(TurnIdReuseError);
    expect(() =>
      db.acceptTurn(task.id, owner, secondId, input),
    ).toThrow(ConflictError);
    expect(() => db.readTurn(task.id, "someone-else", firstId)).toThrow();
  });

  it("commits stream events in order and makes completed turns replayable", () => {
    const { db, task } = setup();
    const input = { type: "message" as const, text: "hello", version: 0 };
    db.acceptTurn(task.id, owner, firstId, input);
    db.recordTurnEvent(task.id, owner, firstId, {
      type: "action",
      message: "Understanding",
    });
    db.recordTurnEvent(task.id, owner, firstId, {
      type: "done",
      task: db.load(task.id, owner),
    });
    const recorded = db.readTurn(task.id, owner, firstId);

    expect(recorded.status).toBe("completed");
    expect(recorded.events.map((row) => row.sequence)).toEqual([1, 2]);
    expect(recorded.events.map((row) => row.event.type)).toEqual([
      "action",
      "done",
    ]);
    expect(db.readTurn(task.id, owner, firstId, 1).events).toHaveLength(1);
    db.recordTurnEvent(task.id, owner, firstId, {
      type: "action",
      message: "Unexpected late event",
    });
    expect(db.readTurn(task.id, owner, firstId).events).toHaveLength(2);
  });

  it("runs the existing conversational model without duplicating pre-saved messages", async () => {
    const { db, task } = setup();
    const input = {
      type: "message" as const,
      text: "hey",
      version: task.brief.version,
    };
    const accepted = db.acceptTurn(task.id, owner, firstId, input);
    let modelCalls = 0;
    let culturalCalls = 0;
    const result = await runTurn(
      db,
      task.id,
      owner,
      { ...input, version: accepted.acceptedVersion },
      () => {},
      {
        async resolve() {
          culturalCalls++;
          throw new Error("Greetings must not call Qloo");
        },
        async discover() {
          culturalCalls++;
          throw new Error("Greetings must not call Qloo");
        },
      },
      {
        async interpret(text, context) {
          modelCalls++;
          expect(text).toBe("hey");
          expect(context?.messages).toHaveLength(0);

          return { intent: "conversation", reply: "Hello. What are we planning?" };
        },
      },
      undefined,
      undefined,
      true,
    );

    expect(result.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result.messages.at(-1)?.text).toContain("Hello.");
    expect(db.load(task.id, owner).messages).toHaveLength(2);
    expect(modelCalls).toBe(1);
    expect(culturalCalls).toBe(0);
  });

  it("preserves a precommitted input after a model failure", async () => {
    const { db, task } = setup();
    const input = { type: "message" as const, text: "What can you do?", version: 0 };
    const accepted = db.acceptTurn(task.id, owner, firstId, input);
    const result = await runTurn(
      db,
      task.id,
      owner,
      { ...input, version: accepted.acceptedVersion },
      () => {},
      undefined,
      {
        async interpret() {
          throw new Error("Provider temporarily unavailable");
        },
      },
      undefined,
      undefined,
      true,
    );

    expect(result.status).toBe("error");
    expect(db.load(task.id, owner).messages).toMatchObject([
      { role: "user", text: input.text },
    ]);
    expect(db.load(task.id, owner).brief.version).toBeGreaterThan(1);
  });
});
