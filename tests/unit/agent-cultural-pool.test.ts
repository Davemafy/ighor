import { expect, it, vi } from "vitest";
import { freshTask, sampleCatalogue } from "../../src/data/fixtures";
import {
  createAgentToolRegistry,
  type AgentToolContext,
} from "../../src/core/agent-tool-registry";
import { evaluateCandidates } from "../../src/capabilities/evaluate";
import { BrightDataResearchProvider } from "../../src/tools/live-research";
import type { CandidateInput } from "../../src/core/contracts";
const oldSeed = "11111111-1111-4111-8111-111111111111";
const newSeed = "22222222-2222-4222-8222-222222222222";
const signal = (seed: string, queryId: string) => ({
  signalScope: "context" as const,
  affinity: 0.4,
  rank: 1,
  queryId,
  seedIds: [seed],
  explanationScope: "none" as const,
  explanationEntities: [],
  delivery: "CACHED" as const,
  retrievedAt: "2026-10-28T10:00:00.000Z",
});

function context(options: CandidateInput[]): AgentToolContext {
  const task = freshTask("pool-test", "owner");
  task.entities = [
    {
      id: "seed:new",
      original: "New reference",
      name: "New reference",
      type: "artist",
      providerId: newSeed,
      status: "resolved",
      metadata: "UNIT TEST",
      choices: [],
    },
  ];

  return {
    task,
    runId: "pool-test",
    sources: [],
    research: { research: vi.fn() },
    cultural: {
      resolve: vi.fn(),
      discover: vi.fn(async () => ({
        status: "ok" as const,
        requestCount: 1,
        evidenceIds: [],
        warnings: [],
        retry: "never" as const,
        data: { options, evidence: [] },
      })),
    },
  };
}

it("merges a repeated candidate's independent query evidence without replacing practical facts", async () => {
  const base = sampleCatalogue()[0];
  const ctx = context([
    {
      ...base,
      id: "same",
      cultural: { context: signal(newSeed, "new-query") },
      cost: { ...base.cost, value: 999 },
    },
  ]);
  ctx.task.catalogue = [
    {
      ...base,
      id: "same",
      cultural: { context: signal(oldSeed, "old-query") },
    },
  ];
  await createAgentToolRegistry(ctx)
    .find((t) => t.name === "qloo.discover")!
    .execute({ entityId: "seed:new", targetType: "movie" }, ctx);
  expect(ctx.task.catalogue).toHaveLength(1);
  const saved = ctx.task.catalogue[0];
  expect(
    Object.values(saved.cultural ?? {})
      .map((s) => s.queryId)
      .sort(),
  ).toEqual(["new-query", "old-query"]);
  expect(saved.cost).toEqual(base.cost);
  expect(Object.values(ctx.task.candidates[0].cultural ?? {})).toHaveLength(2);
});
it("admits a revised seed into a full pool while retaining protected IDs and historical candidates", async () => {
  const base = sampleCatalogue()[0];
  const ctx = context([
    {
      ...base,
      id: "new-choice",
      cultural: { context: signal(newSeed, "new-query") },
    },
  ]);
  ctx.task.catalogue = Array.from({ length: 30 }, (_, i) => ({
    ...base,
    id: `old-${i}`,
    cultural: { context: signal(oldSeed, "old-query") },
  }));
  ctx.task.candidates = evaluateCandidates(ctx.task.catalogue, ctx.task);
  ctx.task.brief.selected = ["old-0"];
  ctx.task.artifacts = [
    {
      id: "approved-note",
      kind: "creative-brief",
      title: "Approved independent work",
      content: "Owner-approved unit test content",
      version: 1,
      dependencies: [],
      evidenceIds: [],
      assumptions: [],
      freshness: "current",
      edited: false,
      locked: true,
      candidateIds: ["old-2"],
    },
  ];
  await createAgentToolRegistry(ctx)
    .find((t) => t.name === "qloo.discover")!
    .execute({ entityId: "seed:new", targetType: "movie" }, ctx);
  expect(ctx.task.catalogue).toHaveLength(30);
  expect(ctx.task.catalogue.map((c) => c.id)).toEqual(
    expect.arrayContaining(["new-choice", "old-0", "old-2"]),
  );
  expect(ctx.task.catalogue.some((c) => c.id === "old-1")).toBe(false);
  expect(ctx.task.candidates.find((c) => c.id === "old-1")?.freshness).toBe(
    "stale",
  );
  expect(ctx.task.artifacts[0].content).toBe(
    "Owner-approved unit test content",
  );
});
it("does not advertise unconfigured research services to the action selector", () => {
  const ctx = context([]);
  ctx.research = new BrightDataResearchProvider("", "", "");
  const tools = createAgentToolRegistry(ctx);
  expect(tools.find((t) => t.name === "web.search")?.available).toBe(false);
  expect(tools.find((t) => t.name === "web.read")?.available).toBe(false);
});

it("continues from resolved entities into discovery before offering document creation", async () => {
  const { runUnifiedAgent } = await import("../../src/core/unified-agent");
  const { SqliteTaskStore } = await import("../../src/data/store");
  const base = sampleCatalogue()[0];
  const ctx = context([
    {
      ...base,
      id: "observed-choice",
      cultural: { context: signal(newSeed, "observed-query") },
    },
  ]);
  ctx.task.mode = "qloo-live";
  ctx.task.catalogue = [];
  ctx.task.candidates = [];
  const store = new SqliteTaskStore(":memory:");
  store.create(ctx.task);
  let steps = 0;

  try {
    await runUnifiedAgent({
      task: ctx.task,
      owner: "owner",
      store,
      goal: "Create a proposal informed by New reference",
      requirements: {
        culturalDecision: true,
        culturalReferences: ["New reference"],
        deliverables: ["proposal"],
      },
      research: ctx.research,
      cultural: ctx.cultural,
      trace: vi.fn(),
      model: {
        interpret: vi.fn(),
        chooseAgentAction: async (_goal, tools) => {
          steps++;

          if (steps === 1) {
            expect(tools.some((tool) => tool.name === "document.create")).toBe(
              false,
            );

            return {
              name: "qloo.discover",
              arguments: { entityId: "seed:new", targetType: "movie" },
            };
          }

          expect(tools.some((tool) => tool.name === "document.create")).toBe(
            true,
          );

          return { name: "agent.finish", arguments: {} };
        },
      },
    });
    expect(ctx.cultural!.resolve).not.toHaveBeenCalled();
    expect(ctx.cultural!.discover).toHaveBeenCalledOnce();
    expect(store.load(ctx.task.id, "owner").catalogue[0].id).toBe(
      "observed-choice",
    );
  } finally {
    store.close();
  }
});
