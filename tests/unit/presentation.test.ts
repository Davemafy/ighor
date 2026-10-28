import { afterEach, expect, it } from "vitest";
import {
  PresentationSchema,
  installPresentation,
  mutateCanvas,
  validatePresentation,
} from "../../src/core/presentation";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import { runTurn } from "../../src/core/orchestrator";
import { modelContext } from "../../src/tools/model-context";
import { readTurnDecision } from "../../src/tools/turn-protocol";
import type { ModelProvider } from "../../src/tools/interfaces";
import { ToolCallingModel } from "../../src/tools/tool-model";

const stores: SqliteTaskStore[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
const surface = () =>
  PresentationSchema.parse({
    id: "launch",
    title: "Launch plan",
    basis: "draft",
    root: "layout",
    nodes: [
      {
        id: "layout",
        type: "stack",
        children: ["draft", "steps", "data", "chart", "activity"],
      },
      {
        id: "draft",
        type: "document",
        title: "Launch brief",
        content: "Launch with a small beta.",
      },
      {
        id: "steps",
        type: "timeline",
        items: [
          { id: "one", label: "Prepare", detail: "Choose the beta group." },
          { id: "two", label: "Launch", detail: "Invite the group." },
        ],
      },
      {
        id: "data",
        type: "table",
        columns: ["Stage", "Hours"],
        rows: [
          { id: "beta", cells: ["Beta", "8"] },
          { id: "launch", cells: ["Launch", "4"] },
        ],
      },
      {
        id: "chart",
        type: "chart",
        tableId: "data",
        labelColumn: 0,
        valueColumn: 1,
      },
      { id: "activity", type: "activity" },
    ],
  });

function setup() {
  const store = new SqliteTaskStore(":memory:");
  stores.push(store);
  const task = freshTask("task", "owner");
  store.create(task);

  return { task, store };
}

const model = (presentation = surface()): ModelProvider => ({
  interpret: async () => ({
    intent: "conversation",
    reply: "Here is a working plan.",
    presentation,
  }),
});

it("agent composes mixed interfaces via the existing provider transport without framework migration", async () => {
  const transport: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));

    if (body.tools[0].name === "route_conversation") {
      return Response.json({
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "route_conversation",
            call_id: "route-1",
            arguments: JSON.stringify({ intent: "delegate" }),
          },
        ],
      });
    }

    expect(body.tools[0].parameters.properties.decision.description).toContain(
      '"presentation"',
    );

    return Response.json({
      status: "completed",
      output: [
        {
          type: "function_call",
          name: "update_brief",
          call_id: "call-1",
          arguments: JSON.stringify({
            decision: JSON.stringify({
              intent: "conversation",
              reply: "Your editable launch plan.",
              presentation: surface(),
            }),
          }),
        },
      ],
    });
  };

  const { task, store } = setup();
  const provider = new ToolCallingModel("test-key", "test-model", transport);
  const result = await runTurn(
    store,
    task.id,
    "owner",
    { type: "message", text: "Prepare my launch plan", version: 0 },
    undefined,
    undefined,
    provider,
  );
  expect(result.canvas?.surface.nodes.map((n) => n.type)).toEqual([
    "stack",
    "document",
    "timeline",
    "table",
    "chart",
    "activity",
  ]);
  expect(result.trace.some((t) => t.action === "ui.present")).toBe(true);
  expect(result.trace.some((t) => t.action.startsWith("discover"))).toBe(false);
  expect(provider.calls).toBe(2);
});

it("only accepts numeric chart criteria and persists them into later model context", async () => {
  const expanded = surface();
  const data = expanded.nodes.find((n) => n.id === "data");

  if (data?.type !== "table") {
    throw Error("Missing fixture table");
  }

  data.columns.push("Cost");
  data.rows[0].cells.push("3");
  data.rows[1].cells.push("7");
  const { task, store } = setup();
  let current = await runTurn(
    store,
    task.id,
    "owner",
    { type: "message", text: "Compare supplied launch figures", version: 0 },
    undefined,
    undefined,
    model(PresentationSchema.parse(expanded)),
  );
  current = await runTurn(store, task.id, "owner", {
    type: "canvas",
    surfaceId: "launch",
    mutation: { operation: "chart-axis", nodeId: "chart", valueColumn: 2 },
    version: current.brief.version,
  });
  expect(current.canvas?.chartAxes.chart).toBe(2);
  expect(
    modelContext(current, "Now use the other measure").canvas?.chartAxes,
  ).toMatchObject({ chart: 2 });
  await expect(
    runTurn(store, task.id, "owner", {
      type: "canvas",
      surfaceId: "launch",
      mutation: { operation: "chart-axis", nodeId: "chart", valueColumn: 0 },
      version: current.brief.version,
    }),
  ).rejects.toThrow(/numeric comparison column/);
  expect(store.load(task.id, "owner").canvas?.chartAxes.chart).toBe(2);
});

it("assigns itinerary days only to saved current stops and clears removed stops", () => {
  const geo = PresentationSchema.parse({
    id: "trip",
    title: "Weekend locations",
    basis: "user-supplied",
    root: "places",
    nodes: [
      {
        id: "places",
        type: "spatial",
        candidateIds: ["museum", "park"],
      },
    ],
  });
  const context = {
    candidates: [
      { id: "museum", freshness: "current" },
      { id: "park", freshness: "current" },
    ],
    evidence: [],
    artifacts: [],
  };
  let canvas = installPresentation(undefined, geo);
  canvas = mutateCanvas(
    canvas,
    "trip",
    {
      operation: "itinerary",
      nodeId: "places",
      candidateIds: ["museum", "park"],
    },
    context,
  );
  canvas = mutateCanvas(
    canvas,
    "trip",
    {
      operation: "itinerary-day",
      nodeId: "places",
      candidateId: "museum",
      day: 2,
    },
    context,
  );
  expect(canvas.itineraryDays.museum).toBe(2);
  canvas = mutateCanvas(
    canvas,
    "trip",
    {
      operation: "itinerary",
      nodeId: "places",
      candidateIds: ["park"],
    },
    context,
  );
  expect(canvas.itineraryDays.museum).toBeUndefined();
  expect(() =>
    mutateCanvas(
      canvas,
      "trip",
      {
        operation: "itinerary-day",
        nodeId: "places",
        candidateId: "museum",
        day: 1,
      },
      context,
    ),
  ).toThrow(/current itinerary stops/);
});

it("persists direct edits and sends the same document, filters and reordered plan into the next agent turn", async () => {
  const { task, store } = setup();
  let saved = await runTurn(
    store,
    task.id,
    "owner",
    { type: "message", text: "Prepare a launch plan", version: 0 },
    undefined,
    undefined,
    model(),
  );

  for (const mutation of [
    {
      operation: "edit",
      nodeId: "draft",
      content: "Use an invite-only beta for 20 people.",
    },
    { operation: "reorder", nodeId: "steps", itemIds: ["two", "one"] },
    { operation: "toggle", nodeId: "steps", itemId: "two" },
    { operation: "filter", nodeId: "data", value: "Beta" },
  ]) {
    saved = await runTurn(store, task.id, "owner", {
      type: "canvas",
      surfaceId: "launch",
      mutation,
      version: saved.brief.version,
    });
  }

  const loaded = store.load(task.id, "owner");
  expect(loaded.canvas?.filters.data).toBe("Beta");
  expect(loaded.canvas?.completed).toEqual(["steps:two"]);
  expect(
    modelContext(loaded, "Make it shorter").canvas?.surface.nodes,
  ).toContainEqual(
    expect.objectContaining({
      id: "draft",
      content: "Use an invite-only beta for 20 people.",
    }),
  );
  const next: ModelProvider = {
    async interpret(_, context) {
      expect(
        context?.canvas?.surface.nodes.find((n) => n.id === "steps"),
      ).toMatchObject({ items: [{ id: "two" }, { id: "one" }] });
      const revised = surface();
      revised.id = "launch-revised";
      const doc = revised.nodes.find((n) => n.type === "document");

      if (doc?.type === "document") {
        doc.content = "Invite 20 beta users.";
      }

      return {
        intent: "conversation",
        reply: "Shortened your invite-only launch plan.",
        presentation: revised,
      };
    },
  };
  saved = await runTurn(
    store,
    task.id,
    "owner",
    { type: "message", text: "Make it shorter", version: loaded.brief.version },
    undefined,
    undefined,
    next,
  );
  expect(saved.canvas?.previous[0].nodes).toContainEqual(
    expect.objectContaining({
      content: "Use an invite-only beta for 20 people.",
    }),
  );
  expect(saved.canvas?.filters.data).toBe("Beta");
  await expect(
    runTurn(store, task.id, "owner", {
      type: "canvas",
      surfaceId: "launch",
      mutation: { operation: "edit", nodeId: "draft", content: "overwrite" },
      version: loaded.brief.version,
    }),
  ).rejects.toThrow();
  expect(store.load(task.id, "owner").canvas).toEqual(saved.canvas);
});

it("rejects executable props, cycles, orphan nodes, bad charts and invented evidence", () => {
  const s = surface();
  expect(
    PresentationSchema.safeParse({
      ...s,
      nodes: [...s.nodes, { id: "evil", type: "script", content: "alert(1)" }],
    }).success,
  ).toBe(false);
  expect(
    PresentationSchema.safeParse({
      ...s,
      nodes: s.nodes.map((n) =>
        n.id === "layout" ? { ...n, children: ["layout"] } : n,
      ),
    }).success,
  ).toBe(false);
  expect(
    PresentationSchema.safeParse({
      ...s,
      nodes: s.nodes.map((n) =>
        n.id === "chart" ? { ...n, valueColumn: 0 } : n,
      ),
    }).success,
  ).toBe(false);
  expect(
    PresentationSchema.safeParse({
      ...s,
      nodes: s.nodes.map((n) =>
        n.id === "draft" ? { ...n, onClick: "run()" } : n,
      ),
    }).success,
  ).toBe(false);
  expect(() =>
    validatePresentation(
      {
        id: "fake",
        title: "Evidence",
        basis: "retrieved-evidence",
        root: "sources",
        nodes: [{ id: "sources", type: "sources", evidenceIds: ["invented"] }],
      },
      freshTask("t", "o"),
    ),
  ).toThrow();
});

it("invalid presentation falls back to a readable answer instead of failing the turn", () => {
  const decision = readTurnDecision(
    JSON.stringify({
      decision: {
        intent: "conversation",
        reply: "This answer is still readable.",
        presentation: { id: "unsupported", nodes: [{ type: "execute" }] },
      },
    }),
    freshTask("t", "o"),
  );
  expect(decision).toMatchObject({
    reply: "This answer is still readable.",
  });
});

it("failed inference retains shared work, and task ownership protects UI mutations", async () => {
  const { task, store } = setup();
  const first = await runTurn(
    store,
    task.id,
    "owner",
    { type: "message", text: "Launch", version: 0 },
    undefined,
    undefined,
    model(),
  );
  const failed = await runTurn(
    store,
    task.id,
    "owner",
    { type: "message", text: "Revise this", version: first.brief.version },
    undefined,
    undefined,
    {
      interpret: async () => {
        throw Error("offline");
      },
    },
  );
  expect(failed.canvas).toEqual(first.canvas);
  await expect(
    runTurn(store, task.id, "other-owner", {
      type: "canvas",
      surfaceId: "launch",
      mutation: { operation: "edit", nodeId: "draft", content: "stolen" },
      version: failed.brief.version,
    }),
  ).rejects.toThrow();
});

it("a greeting leaves existing work intact", async () => {
  const { task, store } = setup();
  task.canvas = installPresentation(undefined, surface());
  store.save(task, 0, "owner");
  const result = await runTurn(
    store,
    task.id,
    "owner",
    { type: "message", text: "hey", version: 0 },
    undefined,
    undefined,
    {
      interpret: async () => ({
        intent: "conversation",
        reply: "Hey. What would you like to do?",
      }),
    },
  );
  expect(result.canvas).toEqual(task.canvas);
});

it("research chooses its own composition without Qloo and preserves supplied source links", async () => {
  const { task, store } = setup();
  task.evidence.push({
    id: "spec",
    source: "user-supplied",
    at: new Date().toISOString(),
    reference: "https://example.com/supplied-specification",
    entityIds: [],
    summary:
      "Specification supplied by the user for comparison, not independently retrieved.",
    limitations: ["Current price is unknown."],
    explanation: null,
    dependencies: [],
    freshness: "current",
  });
  store.save(task, 0, "owner");
  const research = PresentationSchema.parse({
    id: "research",
    title: "Compare frontend development laptops",
    basis: "user-supplied",
    root: "layout",
    nodes: [
      {
        id: "layout",
        type: "stack",
        children: ["finding", "comparison", "sources"],
      },
      {
        id: "finding",
        type: "findings",
        items: [
          {
            text: "Prioritize memory and sustained build performance. Current prices need verification.",
            evidenceIds: ["spec"],
          },
        ],
      },
      {
        id: "comparison",
        type: "table",
        columns: ["Option", "Memory", "Price"],
        rows: [
          {
            id: "one",
            cells: ["Supplied option A", "16 GB", "Unknown"],
            evidenceIds: ["spec"],
          },
          {
            id: "two",
            cells: ["Supplied option B", "24 GB", "Unknown"],
            evidenceIds: [],
          },
          {
            id: "three",
            cells: ["Supplied option C", "32 GB", "Unknown"],
            evidenceIds: [],
          },
        ],
      },
      { id: "sources", type: "sources", evidenceIds: ["spec"] },
    ],
  });
  const result = await runTurn(
    store,
    task.id,
    "owner",
    {
      type: "message",
      text: "Compare my three supplied laptop options for frontend development",
      version: 0,
    },
    undefined,
    {
      resolve: async () => {
        throw Error("Qloo must not run");
      },
      discover: async () => {
        throw Error("Qloo must not run");
      },
    },
    model(research),
  );
  expect(result.canvas?.surface.nodes.map((n) => n.type)).toEqual([
    "stack",
    "findings",
    "table",
    "sources",
  ]);
  expect(result.evidence[0].reference).toBe(
    "https://example.com/supplied-specification",
  );
});
