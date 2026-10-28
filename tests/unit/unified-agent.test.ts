import { describe, expect, it, vi } from "vitest";
import { runUnifiedAgent } from "../../src/core/unified-agent";
import { runTurn } from "../../src/core/orchestrator";
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


});
