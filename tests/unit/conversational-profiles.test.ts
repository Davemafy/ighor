import { expect, it } from "vitest";
import { freshTask } from "../../src/data/fixtures";
import { applyConversationActions } from "../../src/core/conversation";
import { runTurn } from "../../src/core/orchestrator";
import { SqliteTaskStore } from "../../src/data/store";
import { FixtureCulturalProvider } from "../../src/tools/fixture-provider";
import { turnReply } from "../../src/core/turn-reply";

it("creates personal taste from a natural opening and runs the four capabilities without a form", async () => {
  const store = new SqliteTaskStore(":memory:");

  try {
    const task = freshTask("natural", "owner");
    store.create(task);
    const result = await runTurn(
      store,
      task.id,
      "owner",
      {
        type: "message",
        text: "I like Radiohead and Arrival. Find films for me.",
        version: 0,
      },
      () => {},
      new FixtureCulturalProvider(),
      {
        async interpret() {
          return {
            supported: true,
            intent: "goal",
            kind: "discovery",
            targetType: "movie",
            goal: "Find films for me",
            actions: [
              {
                kind: "profile",
                participant: "you",
                preferences: [
                  {
                    value: "Radiohead",
                    entityType: "artist",
                    polarity: "like",
                  },
                  { value: "Arrival", entityType: "movie", polarity: "like" },
                ],
              },
            ],
          };
        },
      },
    );
    expect(result.brief.participants).toHaveLength(1);
    expect(result.brief.participants[0]).toMatchObject({
      id: "you",
      sample: false,
    });
    expect(
      result.brief.participants[0].preferences.map((item) => item.value),
    ).toEqual(["Radiohead", "Arrival"]);
    expect(result.preferences).toEqual([]);
    expect(
      result.trace.find((item) => item.action === "planner")?.outcome,
    ).toContain("discover.retrieve");
    expect(
      result.trace.find((item) => item.action === "planner")?.outcome,
    ).toContain("collaborate.compare");
    expect(result.status).not.toBe("error");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.messages.at(-1)?.text).toContain(result.candidates[0].name);
    const revised = await runTurn(
      store,
      task.id,
      "owner",
      {
        type: "constraints",
        budget: 20,
        version: result.brief.version,
      },
      () => {},
      {
        async resolve() {
          throw new Error("Budget corrections must preserve discovery");
        },
        async discover() {
          throw new Error("Budget corrections must preserve discovery");
        },
      },
    );
    expect(revised.status).not.toBe("error");
    expect(revised.catalogue).toEqual(result.catalogue);
    expect(revised.brief.participants).toEqual(result.brief.participants);
    expect(revised.brief.constraints.budget).toBe(20);
  } finally {
    store.close();
  }
});

it("rejects invented profile values atomically, retaining the original people", () => {
  const task = freshTask("atomic", "owner");
  const original = structuredClone(task);
  const result = applyConversationActions(
    task,
    [
      {
        kind: "profile",
        participant: "you",
        preferences: [{ value: "Radiohead", polarity: "like" }],
      },
      {
        kind: "profile",
        participant: "Alex",
        preferences: [{ value: "Laufey", polarity: "like" }],
      },
    ],
    "I like Radiohead. Alex is joining.",
  );
  expect(result.ok).toBe(false);
  expect(task).toEqual(original);
});

it("keeps real profiles when a named friend joins and never persists taste implicitly", () => {
  const task = freshTask("group", "owner");
  task.brief.participants = [
    { id: "you", name: "You", preferences: [], sample: false },
  ];
  const result = applyConversationActions(
    task,
    [
      {
        kind: "profile",
        participant: "Alex",
        preferences: [
          { value: "Laufey", polarity: "like", entityType: "artist" },
        ],
      },
    ],
    "My friend Alex likes Laufey.",
  );
  expect(result.ok).toBe(true);

  if (!result.ok) {
    return;
  }

  expect(result.task.brief.participants.map((person) => person.name)).toEqual([
    "You",
    "Alex",
  ]);
  expect(result.task.preferences).toEqual([]);
  expect(result.discover).toBe(true);
});

it("describes clarification and stale state without claiming a completed outcome", () => {
  const task = freshTask("reply", "owner");
  task.status = "clarification";
  task.brief.unresolved = ["Which city?"];
  expect(turnReply(task)).toBe("Which city?");
  task.status = "partial";
  expect(turnReply(task)).toContain("No current options");
  expect(turnReply(task)).not.toContain("ready to inspect");
});

it("retains an opening profile while asking for a missing locality", async () => {
  const store = new SqliteTaskStore(":memory:");

  try {
    const task = freshTask("locality", "owner");
    store.create(task);
    const result = await runTurn(
      store,
      task.id,
      "owner",
      {
        type: "message",
        text: "I like Radiohead. Find places for me.",
        version: 0,
      },
      () => {},
      new FixtureCulturalProvider(),
      {
        async interpret() {
          return {
            supported: true,
            intent: "goal",
            kind: "discovery",
            targetType: "place",
            goal: "Find places for me",
            actions: [
              {
                kind: "profile",
                participant: "you",
                preferences: [
                  {
                    value: "Radiohead",
                    entityType: "artist",
                    polarity: "like",
                  },
                ],
              },
            ],
          };
        },
      },
    );
    expect(result.status).toBe("clarification");
    expect(result.brief.unresolved.join(" ")).toContain("city");
    expect(result.brief.participants[0].preferences[0].value).toBe("Radiohead");
    expect(result.brief.participants).toHaveLength(1);
    expect(result.brief.goal).toBe("Find places for me");
    expect(
      result.trace.some((entry) => entry.action === "cultural.discover"),
    ).toBe(false);
  } finally {
    store.close();
  }
});

it("completes an initial request from earlier user facts after a clarifying answer", async () => {
  const { interpretMessage } = await import("../../src/core/interpret-message");
  const { ExecutionBudget } = await import("../../src/core/execution");
  const task = freshTask("clarified-plan", "owner");
  task.messages = [
    {
      role: "user",
      text: "I want a 2-day trip and I like Radiohead.",
      at: new Date().toISOString(),
    },
    {
      role: "assistant",
      kind: "conversation",
      text: "Which city would you like to explore?",
      at: new Date().toISOString(),
    },
  ];
  const update = await interpretMessage(
    task,
    { type: "message", text: "Paris", version: 0 },
    {
      async interpret() {
        return {
          intent: "goal",
          supported: true,
          kind: "discovery",
          goal: "A two-day trip in Paris",
          targetType: "place",
          outcome: { kind: "itinerary", days: 2, transferMinutes: null },
          actions: [
            {
              kind: "profile",
              participant: "you",
              preferences: [
                { value: "Radiohead", entityType: "artist", polarity: "like" },
              ],
            },
            { kind: "constraints", location: "Paris" },
          ],
        };
      },
    },
    new ExecutionBudget(),
    () => {},
  );
  expect(update.interpretationFailed).toBe(false);
  expect(update.clarification).toBeNull();
  expect(update.task.brief.constraints.location).toBe("Paris");
  expect(update.task.brief.outcome).toMatchObject({
    kind: "itinerary",
    days: 2,
  });
  expect(update.task.brief.participants[0].preferences[0].value).toBe(
    "Radiohead",
  );
});
