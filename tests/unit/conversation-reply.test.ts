import { expect, it } from "vitest";
import { freshTask } from "../../src/data/fixtures";
import { runTurn } from "../../src/core/orchestrator";
import { SqliteTaskStore } from "../../src/data/store";
import type { Task, ModelInterpretation } from "../../src/core/contracts";

async function respond(
  task: Task,
  text: string,
  decision: ModelInterpretation,
) {
  const store = new SqliteTaskStore(":memory:");
  store.create(task);
  let calls = 0;

  try {
    const result = await runTurn(
      store,
      task.id,
      task.brief.owner,
      {
        type: "message",
        text,
        version: task.brief.version,
      },
      () => {},
      {
        async resolve() {
          throw new Error("Discussion must not resolve identities");
        },
        async discover() {
          throw new Error("Discussion must not discover");
        },
      },
      {
        get calls() {
          return calls;
        },
        async interpret(message, context) {
          calls++;
          expect(message).toBe(text);
          expect(context).toMatchObject(task);

          return decision;
        },
      },
    );
    expect(store.load(task.id, task.brief.owner)).toEqual(result);

    return result;
  } finally {
    store.close();
  }
}

it.each([
  "hey",
  "Can we think this through first?",
  "I’m unsure where to start",
  "Explain what you mean",
  "Why does that suit us?",
])(
  "allows the model to discuss %s without making planning edits",
  async (text) => {
    const task = freshTask("discussion", "owner");
    task.mode = "qloo-live";
    const reply = "Let’s work through what matters to you first.";
    const result = await respond(task, text, { intent: "conversation", reply });
    expect(result.error).toBeNull();
    expect(result.status).toBe("draft");
    expect(result.messages.at(-1)).toMatchObject({
      role: "assistant",
      kind: "conversation",
      text: reply,
    });
    expect(result.receipts?.at(-1)).toMatchObject({
      modelRequests: 1,
      culturalRequests: 0,
      changed: [],
    });
    expect(result.brief).toEqual({ ...task.brief, version: 1 });
  },
);

it("preserves results, facts and unresolved choices while asking a useful follow-up", async () => {
  const task = freshTask("existing", "owner");
  task.brief.goal = "Find films";
  task.brief.unresolved = ["Which Arrival?"];
  task.status = "clarification";
  const before = structuredClone(task);
  const result = await respond(task, "I’m not sure", {
    intent: "clarification",
    reply: "Do you mean the 2016 film?",
  });
  expect(result.brief).toEqual({ ...before.brief, version: 1 });
  expect(result.catalogue).toEqual(before.catalogue);
  expect(result.artifacts).toEqual(before.artifacts);
  expect(result.evidence).toEqual(before.evidence);
  expect(result.status).toBe("clarification");
});

it("recovers a previous interpretation error without erasing a retrieval failure", async () => {
  const task = freshTask("recovery", "owner");
  task.status = "error";
  task.error = "Interpretation failed safely.";
  task.trace = [
    {
      id: "failure",
      version: 0,
      action: "model.interpret.error",
      outcome: task.error,
      requests: 1,
      durationMs: 1,
      evidenceIds: [],
      at: new Date().toISOString(),
    },
  ];
  const recovered = await respond(task, "Can you explain?", {
    intent: "conversation",
    reply: "Your last request did not complete, but your work is still saved.",
  });
  expect(recovered.error).toBeNull();
  expect(recovered.status).toBe("draft");
  task.trace[0].action = "execution.error";
  task.error = "Qloo rate limit reached.";
  const preserved = await respond(task, "What went wrong?", {
    intent: "conversation",
    reply: "Retrieval reached its rate limit.",
  });
  expect(preserved.error).toBe(task.error);
});

it("rejects evidence invented outside the current thread and retains the failed user message", async () => {
  const task = freshTask("citations", "owner");
  const result = await respond(task, "Why that one?", {
    intent: "conversation",
    reply: "A sourced explanation",
    replyEvidenceIds: ["another-thread-evidence"],
  });
  expect(result.status).toBe("error");
  expect(result.artifacts).toEqual(task.artifacts);
  expect(result.messages.at(-1)).toMatchObject({
    role: "user",
    text: "Why that one?",
  });
});

it("a conversational decision cannot smuggle state edits through extra model fields", async () => {
  const { InterpretationSchema } = await import("../../src/core/contracts");
  const decision = InterpretationSchema.parse({
    intent: "conversation",
    reply: "We can discuss the options first.",
    actions: [{ kind: "constraints", budget: 999 }],
    outcome: { kind: "research" },
  });
  const task = freshTask("no-edits", "owner");
  const result = await respond(task, "Let’s discuss it", decision);
  expect(result.brief).toEqual({ ...task.brief, version: 1 });
  expect(result.receipts?.at(-1)?.changed).toEqual([]);
});
