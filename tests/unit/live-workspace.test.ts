import { expect, it, vi } from "vitest";
import { freshLiveTask, freshLiveExample } from "../../src/data/live-task";
import { TaskSchema } from "../../src/core/contracts";
import { SqliteTaskStore } from "../../src/data/store";
import { runTurn } from "../../src/core/orchestrator";

it("starts personal workspaces without sample people, tastes or results", () => {
  const task = TaskSchema.parse(freshLiveTask("new", "owner"));
  expect(task.brief.participants).toEqual([]);
  expect(task.brief.suppliedFacts).toEqual([]);
  expect(task.catalogue).toEqual([]);
  expect(task.entities).toEqual([]);
  expect(task.brief.assumptions.join(" ")).toContain("starting defaults");
  expect(freshLiveExample("example", "owner").brief.participants).toHaveLength(
    6,
  );
});

it("asks for a cultural reference before retrieval and retains the supplied locality", async () => {
  const task = freshLiveTask("incomplete", "owner");
  const store = new SqliteTaskStore(":memory:");
  store.create(task);
  const provider = {
    calls: 0,
    resolve: vi.fn(async () => {
      throw new Error("Not ready");
    }),
    discover: vi.fn(async () => {
      throw new Error("Not ready");
    }),
  };

  try {
    const result = await runTurn(
      store,
      task.id,
      "owner",
      {
        type: "message",
        text: "Find somewhere in Paris",
        version: 0,
      },
      () => {},
      provider,
      {
        async interpret() {
          return {
            intent: "goal",
            kind: "discovery",
            goal: "Find a place in Paris",
            targetType: "place",
            actions: [{ kind: "constraints", location: "Paris" }],
          };
        },
      },
    );
    expect(result.status).toBe("clarification");
    expect(result.error).toBeNull();
    expect(result.brief.constraints.location).toBe("Paris");
    expect(result.brief.unresolved.join(" ")).toContain("enjoy");
    expect(provider.resolve).not.toHaveBeenCalled();
    expect(provider.discover).not.toHaveBeenCalled();
    expect(result.receipts?.at(-1)?.culturalRequests).toBe(0);
    expect(store.load(task.id, "owner").messages).toEqual(result.messages);
  } finally {
    store.close();
  }
});

it("attributes shared taste without fabricating individual friends or consent", async () => {
  const { applyConversationActions } =
    await import("../../src/core/conversation");
  const task = freshLiveTask("shared", "owner");
  const result = applyConversationActions(
    task,
    [
      {
        kind: "profile",
        participant: "group",
        preferences: [
          { value: "Radiohead", entityType: "artist", polarity: "like" },
        ],
      },
    ],
    "We love Radiohead",
  );
  expect(result.ok).toBe(true);

  if (result.ok) {
    expect(result.task.brief.participants).toHaveLength(1);
    expect(result.task.brief.participants[0]).toMatchObject({
      id: "group",
      name: "Your group",
      sample: false,
    });
    expect(result.task.brief.participants[0].preferences[0]).toMatchObject({
      subject: "group",
      value: "Radiohead",
      source: "user-supplied",
    });
    expect(result.task.preferences).toEqual([]);
  }

  const invented = applyConversationActions(
    task,
    [
      {
        kind: "profile",
        participant: "group",
        preferences: [
          { value: "Radiohead", entityType: "artist", polarity: "like" },
        ],
      },
    ],
    "I love Radiohead",
  );
  expect(invented.ok).toBe(false);
});
