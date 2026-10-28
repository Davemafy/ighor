import { describe, expect, it, vi } from "vitest";
import { runUnifiedAgent } from "../../src/core/unified-agent";
import { runTurn } from "../../src/core/orchestrator";
import { ToolCallingModel } from "../../src/tools/tool-model";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import type { ResearchProvider } from "../../src/tools/live-research";
import type { CulturalProvider } from "../../src/tools/interfaces";

function source() {
  return {
    id: "web-1", title: "Official venue",
    url: "https://example.org/venue",
    snippet: "A primary venue source.",
    retrievedAt: "2026-10-28T10:00:00.000Z",
  };
}

describe("unified tool orchestration", () => {
  it("uses actual observations to select web -> Qloo -> document, and checkpoints every result", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("unified", "owner");
    task.mode = "qloo-live";
    store.create(task);
    const research: ResearchProvider = {
      research: vi.fn(),
      searchOnce: vi.fn(async () => ({
        status: "partial" as const, sources: [source()], requests: 1,
      })),
    };
    const cultural: CulturalProvider = {
      resolve: vi.fn(async () => ({
        status: "ok" as const, evidenceIds: [], retry: "never" as const, requestCount: 1, warnings: [],
        data: {
          id: "seed:radiohead", original: "Radiohead", name: "Radiohead",
          type: "artist" as const, providerId: "11111111-1111-4111-8111-111111111111",
          status: "resolved" as const, metadata: "LIVE Qloo", choices: [],
        },
      })),
      discover: vi.fn(async () => ({
        status: "ok" as const, evidenceIds: [], retry: "never" as const, requestCount: 1,
        warnings: [], data: { options: [], evidence: [] },
      })),
    };
    const choose = vi.fn(async (_goal: string, _tools: unknown, observed: {tool:string;status:string;summary:string}[]) => {
      if (observed.length === 0) return { name: "web.search", arguments: { query: "listening bar Berlin" } };
      if (observed.length === 1) {
        expect(observed[0].summary).toContain("1 new unique sources");
        return { name: "qloo.resolve_entity", arguments: { name: "Radiohead", type: "artist" } };
      }
      if (observed.length === 2) {
        expect(observed[1].summary).toContain("Radiohead");
        return { name: "qloo.discover", arguments: {
          entityId: "seed:radiohead", targetType: "movie",
        } };
      }
      expect(observed[2].summary).toContain("Qloo");
      return { name: "document.create", arguments: {
        title: "Berlin music research",
        content: "## Observed source\nPrimary venue lead [web-1].\n\nQloo identity and discovery are separate from verified venue facts.",
        sourceIds: ["web-1"],
      } };
    });
    try {
      const response = await runUnifiedAgent({
        task, store, owner: "owner", goal: "Research Berlin venues with Radiohead context",
        research, cultural, model: {
          chooseAgentAction: choose,
          async interpret() { throw new Error("should not run"); },
        },
        trace() {},
      });
      expect(response.sources).toHaveLength(1);
      expect(task.agentRun?.status).toBe("completed");
      expect(task.agentRun?.steps.map((s) => s.tool)).toEqual([
        "web.search", "qloo.resolve_entity", "qloo.discover", "document.create",
      ]);
      expect(task.artifacts.some((a) => a.title === "Berlin music research")).toBe(true);
      expect(task.evidence.some((e) => e.reference === "https://example.org/venue")).toBe(true);
      const loaded = store.load(task.id, "owner");
      expect(loaded.agentRun?.steps).toHaveLength(4);
      expect(loaded.entities.some((e) => e.name === "Radiohead")).toBe(true);
      expect(loaded.artifacts).toEqual(task.artifacts);
      expect(cultural.resolve).toHaveBeenCalledTimes(1);
    } finally { store.close(); }
  });

  it("provides the model actual bounded source excerpts and Qloo evidence when choosing a next action", async () => {
    const task = freshTask("observed-decisions", "owner");
    const observedText = "PRIMARY SOURCE: We host tabletop games on Saturdays. " + "A".repeat(5000);
    task.agentRun = {
      id: "11111111-1111-4111-8111-111111111111",
      goal: "Compare venues and a band with cultural relevance",
      status: "observing",
      startedAt: "2026-10-28T10:00:00.000Z",
      updatedAt: "2026-10-28T10:00:01.000Z",
      maxSteps: 4, maxRequests: 8, requests: 1, modelSteps: 1,
      steps: [],
      sources: [{...source(), excerpt: observedText }],
      warnings: [],
    };
    task.evidence.push({
      id: "qloo-signal", source: "provider-returned", kind: "cultural",
      at: "2026-10-28T10:00:00.000Z", reference: "qloo:observed",
      title: "Cultural association", entityIds: [],
      summary: "Qloo returned this association for the named artist.",
      limitations: [], explanation: null, dependencies: [],
      freshness: "current",
    });
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const context = JSON.parse(request.input[1].content);
      expect(context.observedSources[0]).toMatchObject({
        id: "web-1", title: "Official venue",
      });
      expect(context.observedSources[0].observedPageText).toContain(
        "We host tabletop games on Saturdays",
      );
      expect(context.observedSources[0].observedPageText.length).toBe(1300);
      expect(context.culturalEvidence[0].summary).toContain("Qloo returned");
      expect(context.observations).toEqual([]);
      return Response.json({
        status: "completed", output: [{
          type: "function_call", name: "choose_agent_action", call_id: "agent",
          arguments: JSON.stringify({name: "agent.finish", argumentsJson: "{}"}),
        }],
      });
    });
    const model = new ToolCallingModel("fake-test-key", "test-model", transport);
    const selected = await model.chooseAgentAction(
      "Decide how to use the observed results",
      [{name: "agent.finish", description: "Stop", permission: "read"}], [], task,
    );
    expect(selected).toEqual({name: "agent.finish", arguments: {}});
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("actually reads a returned source before creating an evidence-grounded document", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("read-then-write", "owner");
    store.create(task);
    const readSource = vi.fn(async (url: string) => {
      expect(url).toBe("https://example.org/venue");
      return {
        status: "ok" as const, requests: 1,
        excerpt: "Official venue page explicitly confirms Saturday tabletop nights.",
      };
    });
    const choose = vi.fn(async (
      _goal: string, _tools: unknown, observed: {tool: string}[], context: typeof task,
    ) => {
      if (!observed.length) {
        return {name: "web.search", arguments: {query: "Saturday venue Berlin"}};
      }
      if (observed.length === 1) {
        expect(context.agentRun?.sources[0].id).toBe("web-1");
        return {name: "web.read", arguments: {sourceId: "web-1"}};
      }
      expect(context.agentRun?.sources[0].excerpt).toContain(
        "explicitly confirms Saturday tabletop nights",
      );
      return {name: "document.create", arguments: {
        title: "Observed Saturday venue",
        content: "Saturday tabletop nights confirmed on venue page; other facts remain unverified.",
        sourceIds: ["web-1"],
      }};
    });
    try {
      const result = await runUnifiedAgent({
        task, store, owner: "owner", goal: "Find verified Saturday tabletop venues",
        research: {
          research: vi.fn(),
          searchOnce: vi.fn(async () => ({
            status: "ok" as const, sources: [source()], requests: 1,
          })),
          readSource,
        },
        model: {
          chooseAgentAction: choose,
          async interpret() { throw new Error("unused"); },
        },
        trace() {},
      });
      expect(readSource).toHaveBeenCalledTimes(1);
      expect(result.sources[0].excerpt).toContain("Saturday tabletop nights");
      expect(task.agentRun?.steps.map((step) => step.tool)).toEqual([
        "web.search", "web.read", "document.create",
      ]);
      expect(task.agentRun?.status).toBe("completed");
      expect(task.artifacts[0].evidenceIds).toContain(
        `read-then-write:agent:${task.agentRun?.id}:web-1`,
      );
      expect(store.load(task.id, "owner").agentRun?.sources[0].excerpt)
        .toContain("Saturday tabletop nights");
    } finally { store.close(); }
  });

  it("keeps prior execution receipts when a follow-up starts a fresh run", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("multiple-runs", "owner");
    store.create(task);
    const search = vi.fn(async () => ({
      status: "ok" as const, sources: [source()], requests: 1,
    }));
    const chooser = vi.fn(async (
      _goal: string, _tools: unknown, observed: {tool:string}[],
    ) => observed.length
      ? {name: "agent.finish", arguments: {}}
      : {name: "web.search", arguments: {query: "Berlin venue"}},
    );
    try {
      const options = {
        task, store, owner: "owner",
        research: {research: vi.fn(), searchOnce: search},
        model: {chooseAgentAction: chooser, async interpret() {throw new Error("unused");}},
        trace() {},
      };
      await runUnifiedAgent({...options, goal: "Find first venue"});
      const firstId = task.agentRun?.id;
      expect(task.agentRun?.status).toBe("completed");
      await runUnifiedAgent({...options, goal: "Investigate another venue"});
      expect(task.agentRun?.id).not.toBe(firstId);
      expect(task.agentRunHistory).toHaveLength(1);
      expect(task.agentRunHistory?.[0]).toMatchObject({
        id: firstId, goal: "Find first venue", status: "completed",
        toolNames: ["web.search"], sourceCount: 1, requests: 1,
      });
      expect(store.load(task.id, "owner").agentRunHistory).toEqual(task.agentRunHistory);
      expect(search).toHaveBeenCalledTimes(2);
    } finally { store.close(); }
  });

  it("preserves partial status when a run found sources but exhausted its steps before producing a deliverable", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("partial-discovery", "owner");
    store.create(task);
    const prior = process.env.IGOR_AGENT_MAX_STEPS;
    process.env.IGOR_AGENT_MAX_STEPS = "1";
    try {
      const result = await runUnifiedAgent({
        task, store, owner: "owner", goal: "Find and compare a venue, then save a plan",
        research: {
          research: vi.fn(),
          searchOnce: vi.fn(async () => ({
            status: "ok" as const, sources: [source()], requests: 1,
          })),
        },
        model: {
          chooseAgentAction: vi.fn(async () => ({
            name: "web.search", arguments: { query: "official venue Berlin" },
          })),
          async interpret() { throw new Error("unused"); },
        },
        trace() {},
      });
      expect(result.sources).toHaveLength(1);
      expect(task.agentRun?.status).toBe("partially_completed");
      expect(task.agentRun?.warnings.join(" ")).toContain(
        "before a verified completion decision",
      );
      expect(task.artifacts).toHaveLength(0);
      expect(store.load(task.id, "owner").agentRun?.status).toBe("partially_completed");
    } finally {
      if (prior === undefined) delete process.env.IGOR_AGENT_MAX_STEPS;
      else process.env.IGOR_AGENT_MAX_STEPS = prior;
      store.close();
    }
  });

  it("does not execute unobserved page reads, duplicate actions, or unknown tools", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("reject", "owner");
    store.create(task);
    const research: ResearchProvider = { research: vi.fn(), readSource: vi.fn() };
    const selected = vi.fn(async () => ({
      name: "web.read", arguments: { sourceId: "web-invented" },
    }));
    try {
      await runUnifiedAgent({ task, store, owner: "owner",
        goal: "Inspect a source", research,
        model: { chooseAgentAction: selected,
          async interpret() { throw new Error("unused"); } }, trace() {} });
      expect(research.readSource).not.toHaveBeenCalled();
      expect(task.agentRun?.steps[0].status).toBe("blocked");
      expect(selected).toHaveBeenCalledTimes(2);
      expect(task.agentRun?.warnings.join(" ")).toMatch(/Repeated tool/);
    } finally { store.close(); }
  });

  it("does not overwrite a newer user correction after an in-flight tool finishes", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("race", "owner");
    store.create(task);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const research: ResearchProvider = {
      research: vi.fn(),
      searchOnce: vi.fn(async () => {
        await gate;
        return { status: "ok" as const, sources: [source()], requests: 1 };
      }),
    };
    const pending = runUnifiedAgent({ task, store, owner: "owner",
      goal: "Find a venue", research,
      model: { chooseAgentAction: async () => ({
        name: "web.search", arguments: { query: "venue Berlin" },
      }), async interpret() { throw new Error("unused"); } }, trace() {} });
    try {
      await vi.waitFor(() => expect(research.searchOnce).toHaveBeenCalledTimes(1));
      const newer = store.load(task.id, "owner");
      newer.brief.goal = "User's newer correction";
      const expected = newer.brief.version;
      newer.brief.version++;
      store.save(newer, expected, "owner");
      release();
      await expect(pending).rejects.toThrow();
      expect(store.load(task.id, "owner").brief.goal).toBe("User's newer correction");
    } finally { release(); store.close(); }
  });
  it("marks stale persisted agent steps interrupted without erasing results or replaying calls", () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("interrupted", "owner");
    task.status = "running";
    task.agentRun = {
      id: "11111111-1111-4111-8111-111111111111",
      goal: "Find real sources",
      status: "executing_tool",
      startedAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-20T00:00:00.000Z",
      maxSteps: 4, maxRequests: 8, requests: 1,
      modelSteps: 1, steps: [],
      sources: [source()],
      warnings: [],
    };
    try {
      store.create(task);
      const loaded = store.load(task.id, "owner");
      expect(loaded.agentRun?.status).toBe("interrupted");
      expect(loaded.agentRun?.sources).toHaveLength(1);
      expect(loaded.status).toBe("partial");
    } finally { store.close(); }
  });


  it("executes the agent through the real task-turn API and survives reload", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("integrated-turn", "owner");
    task.mode = "qloo-live";
    store.create(task);
    const research: ResearchProvider = {
      research: vi.fn(),
      searchOnce: vi.fn(async () => ({
        status: "partial" as const, sources: [source()], requests: 1,
      })),
    };
    const choose = vi.fn(async (_goal: string, _tools: unknown, observations: {tool:string}[]) =>
      observations.length ? { name: "agent.finish", arguments: {} } :
        { name: "web.search", arguments: {query: "Berlin official venue"} });
    try {
      const result = await runTurn(
        store, task.id, "owner",
        {type: "message", text: "Research listening bars in Berlin", version: 0},
        () => {}, undefined, {
          routeConversation: async () => ({ intent: "research" as const, query: "Berlin listening bars" }),
          chooseAgentAction: choose,
          synthesizeResearch: async () => ({
            text: "An official venue page is a source lead [web-1].",
            sourceIds: ["web-1"],
          }),
          async interpret() { throw new Error("Heavy interpreter should not run"); },
        }, undefined, research,
      );
      expect(choose).toHaveBeenCalledTimes(2);
      expect(result.agentRun?.steps[0].tool).toBe("web.search");
      expect(result.agentRun?.status).toBe("completed");
      expect(result.messages.at(-1)?.text).toContain("source lead");
      expect(result.artifacts.some((a) => a.kind === "research-report")).toBe(true);
      const reloaded = store.load(task.id, "owner");
      expect(reloaded.agentRun?.id).toBe(result.agentRun?.id);
      expect(reloaded.artifacts).toEqual(result.artifacts);
      expect(reloaded.evidence.length).toBe(result.evidence.length);
    } finally { store.close(); }
  });


  it("accepts an agent route and delegates tool choice to the unified executor", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({
      status: "completed", output: [{
        type: "function_call", name: "route_conversation", call_id: "r-agent",
        arguments: JSON.stringify({
          intent: "agent",
          query: "Research listening bars in Berlin with Radiohead cultural context",
        }),
      }],
    }));
    const model = new ToolCallingModel("test-key","model-test",transport);
    const route = await model.routeConversation(
      "Explore Berlin listening bars and connect them to Radiohead",
      freshTask("routing","owner"),
    );
    expect(route).toMatchObject({
      intent: "research",
      query: "Research listening bars in Berlin with Radiohead cultural context",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });


});
