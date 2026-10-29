import { expect, it } from "vitest";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import {
  ordinalMention,
  resolveOrdinalFocus,
  updateConversationFocus,
} from "../../src/core/conversation-focus";
import { modelContext } from "../../src/tools/model-context";

it("stores the ordered choice identity in the owner-scoped task and model context", () => {
  const task = freshTask("focus-workspace", "owner");
  const db = new SqliteTaskStore(":memory:");

  try {
    db.create(task);
    const saved = db.load(task.id, "owner");
    const ids = saved.catalogue.map((item) => item.id);
    expect(saved.conversationFocus?.activeCandidateIds).toEqual(ids);
    expect(saved.conversationFocus?.ordinalMap["2"]).toBe(ids[1]);
    const second = resolveOrdinalFocus(saved, "the second one");

    expect(second).toMatchObject({
      kind: "resolved",
      ordinal: 2,
      candidateId: ids[1],
    });
    const context = modelContext(saved, "Explain the second one");

    expect(context.conversationFocus?.orderedCandidates[1]).toMatchObject({
      position: 2,
      id: ids[1],
    });
    expect(JSON.stringify(context)).not.toContain("focus-workspace");
    expect(JSON.stringify(context)).not.toContain('"owner"');
  } finally {
    db.close();
  }
});

it("never guesses an ordinal when the focused result is absent", () => {
  const task = freshTask("no-options", "owner");
  task.catalogue = [];
  task.candidates = [];
  expect(resolveOrdinalFocus(task, "the second one").kind).toBe("ambiguous");
  expect(ordinalMention("change the budget to 200")).toBeNull();
  expect(ordinalMention("the third artist")).toBe(3);
});

it("never resolves a stale evaluated choice through its catalogue copy", () => {
  const task = freshTask("stale-focus", "owner");
  updateConversationFocus(task);
  const first = task.catalogue[0];
  task.candidates = [
    {
      ...first,
      eligibility: "needs-review",
      freshness: "stale",
      evidenceIds: [],
      dependencies: [],
      missing: [],
      violations: [],
      fit: {},
      fitReason: "Stale fixture",
    },
  ];
  expect(resolveOrdinalFocus(task, "the first one").kind).toBe("ambiguous");
  updateConversationFocus(task);
  expect(task.conversationFocus?.activeCandidateIds).not.toContain(first.id);
});
