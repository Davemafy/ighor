import { expect, it } from "vitest";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import { runTurn } from "../../src/core/orchestrator";
import type { ModelInterpretation } from "../../src/core/contracts";

async function propose(text: string, decision: ModelInterpretation) {
  const task = freshTask("readiness", "owner");
  const store = new SqliteTaskStore(":memory:");
  store.create(task);

  try {
    const result = await runTurn(
      store,
      task.id,
      "owner",
      { type: "message", text, version: 0 },
      () => {},
      {
        async resolve() {
          throw new Error("Incomplete plans must not resolve identities");
        },
        async discover() {
          throw new Error("Incomplete plans must not discover");
        },
      },
      {
        async interpret() {
          return decision;
        },
      },
    );

    return { task, result };
  } finally {
    store.close();
  }
}

it("derives the itinerary domain and asks for a missing destination without failing", async () => {
  const { result } = await propose("planning a weekend trip with friends", {
    intent: "goal",
    kind: "discovery",
    goal: "A weekend trip with friends",
    outcome: { kind: "itinerary", days: 2, transferMinutes: null },
  });
  expect(result.error).toBeNull();
  expect(result.status).toBe("clarification");
  expect(result.brief.targetType).toBe("place");
  expect(result.brief.unresolved.join(" ")).toContain("city");
  expect(result.receipts?.at(-1)?.culturalRequests).toBe(0);
});

it("treats ungrounded allowances as a clarifying question with no partial plan edits", async () => {
  const { task, result } = await propose("A 2-day trip in Paris", {
    intent: "goal",
    kind: "discovery",
    goal: "A trip",
    targetType: "place",
    outcome: { kind: "itinerary", days: 2, transferMinutes: 30 },
  });
  expect(result.error).toBeNull();
  expect(result.status).toBe("draft");
  expect(result.messages.at(-1)).toMatchObject({
    kind: "conversation",
    text: "How much time should I allow for travel between stops?",
  });
  expect(result.brief).toEqual({ ...task.brief, version: 1 });
  expect(result.catalogue).toEqual(task.catalogue);
  expect(result.receipts?.at(-1)?.changed).toEqual([]);
  expect(result.receipts?.at(-1)?.culturalRequests).toBe(0);
});
