import { afterEach, expect, it } from "vitest";
import {
  PresentationSchema,
  installPresentation,
  mutateCanvas,
} from "../../src/core/presentation";
import { ensureBoundPresentation } from "../../src/core/presentation-default";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import { runTurn } from "../../src/core/orchestrator";
import { modelContext } from "../../src/tools/model-context";

const stores: SqliteTaskStore[] = [];
afterEach(() => stores.splice(0).forEach((store) => store.close()));
const question = () =>
  PresentationSchema.parse({
    id: "trip-input",
    title: "Your trip",
    basis: "draft",
    root: "details",
    nodes: [
      {
        id: "details",
        type: "question",
        prompt: "A few details to shape your trip.",
        fields: [
          { id: "from", label: "Leaving from", type: "text" },
          { id: "date", label: "Departure", type: "date" },
          { id: "budget", label: "Budget", type: "number" },
          {
            id: "pace",
            label: "Pace",
            type: "choice",
            options: ["Slow", "Packed"],
          },
        ],
      },
    ],
  });
const values = {
  from: "Lagos",
  date: "2026-11-03",
  budget: "200",
  pace: "Slow",
};

it("rejects missing, invented, malformed and obsolete form answers", () => {
  const task = freshTask("question", "owner");
  const canvas = installPresentation(undefined, question());
  const answer = (next: Record<string, string>, surface = "trip-input") =>
    mutateCanvas(
      structuredClone(canvas),
      surface,
      { operation: "answer", nodeId: "details", values: next },
      task,
    );
  expect(() => answer({ ...values, from: "  " })).toThrow(/Leaving from/);
  expect(() => answer({ ...values, pace: "Invented" })).toThrow(/offered/);
  expect(() => answer({ ...values, unknown: "x" })).toThrow(/Unknown/);
  expect(() => answer({ ...values, budget: "NaN" })).toThrow(/number/);
  expect(() => answer({ ...values, date: "2026-02-30" })).toThrow(/date/);
  expect(() => answer(values, "replaced")).toThrow(/replaced/);
  expect(canvas.answers).toEqual({});
});

it("submits structured answers as one real agent turn, persists them and prevents stale overwrite", async () => {
  const store = new SqliteTaskStore(":memory:");
  stores.push(store);
  const task = freshTask("question", "owner");
  store.create(task);
  let calls = 0;
  let receivedText = "";
  let receivedAnswers: unknown;
  const first = await runTurn(
    store,
    task.id,
    "owner",
    { type: "message", text: "Plan a trip", version: 0 },
    undefined,
    undefined,
    {
      interpret: async () => ({
        intent: "clarification",
        reply: "Where shall we start?",
        presentation: question(),
      }),
    },
  );
  expect(first.status).toBe("clarification");
  const result = await runTurn(
    store,
    task.id,
    "owner",
    {
      type: "canvas",
      surfaceId: "trip-input",
      mutation: { operation: "answer", nodeId: "details", values },
      version: first.brief.version,
    },
    undefined,
    undefined,
    {
      interpret: async (text, current) => {
        calls++;
        receivedText = text;
        receivedAnswers = current?.canvas?.answers["trip-input:details"];

        return {
          intent: "conversation",
          reply: "I have your departure details.",
        };
      },
    },
  );
  expect(calls).toBe(1);
  expect(receivedText).toContain("Leaving from: Lagos");
  expect(receivedText).toContain("Budget: 200");
  expect(receivedAnswers).toEqual(values);
  expect(result.status).not.toBe("error");
  expect(result.messages.at(-1)?.text).toBe("I have your departure details.");
  expect(result.brief.version).toBe(first.brief.version + 1);
  const loaded = store.load(task.id, "owner");
  expect(loaded.canvas?.answers["trip-input:details"]).toEqual(values);
  expect(
    modelContext(loaded, "Continue").canvas?.answers["trip-input:details"],
  ).toEqual(values);
  expect(
    loaded.messages.filter((message) => message.role === "user"),
  ).toHaveLength(2);
  await expect(
    runTurn(store, task.id, "owner", {
      type: "canvas",
      surfaceId: "trip-input",
      mutation: { operation: "answer", nodeId: "details", values },
      version: first.brief.version,
    }),
  ).rejects.toThrow(/newer/);
});

it("adds only grounded places to an authored surface without replacing its work or saved answers", () => {
  const task = freshTask("map", "owner");
  task.canvas = installPresentation(undefined, question());
  task.canvas.answers["trip-input:details"] = values;
  const candidate = {
    id: "place",
    name: "Supplied place",
    type: "place",
    freshness: "current",
    place: { latitude: 6.45, longitude: 3.39 },
  };
  task.candidates = [candidate] as typeof task.candidates;
  ensureBoundPresentation(task);
  expect(task.canvas.surface.id).toBe("trip-input");
  expect(
    task.canvas.surface.nodes.find((node) => node.id === "details")?.type,
  ).toBe("question");
  expect(
    task.canvas.surface.nodes.find((node) => node.type === "spatial"),
  ).toMatchObject({ candidateIds: ["place"] });
  expect(task.canvas.answers["trip-input:details"]).toEqual(values);
  ensureBoundPresentation(task);
  expect(
    task.canvas.surface.nodes.filter((node) => node.type === "spatial"),
  ).toHaveLength(1);
  task.canvas = installPresentation(undefined, question());
  task.candidates = [
    { ...candidate, place: { latitude: 200, longitude: 3 } },
  ] as typeof task.candidates;
  ensureBoundPresentation(task);
  expect(
    task.canvas.surface.nodes.some((node) => node.type === "spatial"),
  ).toBe(false);
});

it("retains all accepted form values when their combined text exceeds the chat composer limit", async () => {
  const store = new SqliteTaskStore(":memory:");
  stores.push(store);
  const task = freshTask("long-question", "owner");
  const form = PresentationSchema.parse({
    id: "details",
    title: "Creative context",
    basis: "draft",
    root: "inputs",
    nodes: [
      {
        id: "inputs",
        type: "question",
        prompt: "Describe your idea and audience.",
        fields: [
          { id: "idea", label: "Idea", type: "text" },
          { id: "audience", label: "Audience", type: "text" },
        ],
      },
    ],
  });
  task.canvas = installPresentation(undefined, form);
  store.create(task);
  const longValues = { idea: "a".repeat(2000), audience: "b".repeat(2000) };
  let received = "";
  const result = await runTurn(
    store,
    task.id,
    "owner",
    {
      type: "canvas",
      surfaceId: "details",
      mutation: { operation: "answer", nodeId: "inputs", values: longValues },
      version: 0,
    },
    undefined,
    undefined,
    {
      interpret: async (text) => {
        received = text;

        return { intent: "conversation", reply: "Context received." };
      },
    },
  );
  expect(received).toContain(longValues.idea);
  expect(received).toContain(longValues.audience);
  expect(result.status).not.toBe("error");
  expect(
    store.load(task.id, "owner").canvas?.answers["details:inputs"],
  ).toEqual(longValues);
});
