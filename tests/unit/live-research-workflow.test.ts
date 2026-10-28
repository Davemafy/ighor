import { describe, expect, it, vi } from "vitest";
import { runTurn } from "../../src/core/orchestrator";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import type { ResearchProvider } from "../../src/tools/live-research";

const sources = [
  {
    id: "web-1",
    title: "Documented results",
    url: "https://example.com/evidence",
    snippet: "Brief preview.",
    excerpt: "A source document says the event was announced.",
    retrievedAt: "2026-10-27T20:00:00.000Z",
  },
  {
    id: "web-2",
    title: "Second search result",
    url: "https://example.org/background",
    snippet: "Search preview only.",
    retrievedAt: "2026-10-27T20:00:00.000Z",
  },
];

describe("read-only web research through Igor's persistent execution", () => {
  it("executes a real-provider contract, links citations and resumes after reload", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("research-flow", "owner");
    task.mode = "qloo-live";
    task.brief.goal = "Preserve my existing creative project";
    store.create(task);
    const research: ResearchProvider = {
      research: vi.fn(async () => ({
        status: "ok" as const,
        sources,
        requests: 2,
      })),
    };
    const model = {
      routeConversation: vi.fn(async () => ({
        intent: "research" as const,
        query: "current event announcement",
      })),
      synthesizeResearch: vi.fn(async () => ({
        text: "A retrieved document reports an announcement [web-1].",
        sourceIds: ["web-1"],
      })),
      interpret: vi.fn(async () => {
        throw new Error("Cultural planner must not run");
      }),
    };

    try {
      const completed = await runTurn(
        store,
        task.id,
        "owner",
        {
          type: "message",
          text: "Find the current event announcement",
          version: 0,
        },
        () => {},
        undefined,
        model,
        undefined,
        research,
      );
      expect(research.research).toHaveBeenCalledWith(
        "current event announcement",
      );
      expect(model.interpret).not.toHaveBeenCalled();
      expect(completed.messages.at(-1)?.text).toContain(
        "https://example.com/evidence",
      );
      expect(completed.messages.at(-1)?.evidenceIds).toEqual([
        "research-flow:web:1:web-1",
        "research-flow:web:1:web-2",
      ]);
      expect(completed.messages.at(-1)?.text).toContain("search snippet only");
      expect(completed.evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "provider-returned",
            kind: "practical",
            reference: "https://example.com/evidence",
          }),
        ]),
      );
      expect(completed.trace.map((t) => t.action)).toContain(
        "tool.result:search_web",
      );
      expect(completed.brief.goal).toBe(task.brief.goal);
      expect(completed.brief.version).toBe(2);
      expect(completed.receipts?.at(-1)).toMatchObject({
        culturalRequests: 0,
        changed: ["evidence:research"],
      });
      const resumed = store.load(task.id, "owner");
      expect(resumed.evidence).toEqual(completed.evidence);
      expect(resumed.messages).toEqual(completed.messages);
      await expect(
        runTurn(
          store,
          task.id,
          "owner",
          { type: "message", text: "Retry", version: 0 },
          () => {},
          undefined,
          model,
          undefined,
          research,
        ),
      ).rejects.toThrow("newer");
      expect(research.research).toHaveBeenCalledTimes(1);
    } finally {
      store.close();
    }
  });

  it("checkpoints the user turn before network execution and rejects stale results", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("research-race", "owner");
    task.mode = "qloo-live";
    task.brief.goal = "Original approved direction";
    store.create(task);
    let releaseResearch!: (value: {
      status: "ok";
      sources: typeof sources;
      requests: number;
    }) => void;
    const gate = new Promise<{
      status: "ok";
      sources: typeof sources;
      requests: number;
    }>((resolve) => {
      releaseResearch = resolve;
    });
    const model = {
      async routeConversation() {
        return { intent: "research" as const, query: "recent market findings" };
      },
      async synthesizeResearch() {
        return {
          text: "A finding supported by the returned source [web-1].",
          sourceIds: ["web-1"],
        };
      },
      async interpret() {
        throw new Error("Full planner must not run");
      },
    };

    try {
      const pending = runTurn(
        store,
        task.id,
        "owner",
        {
          type: "message",
          text: "Research recent market findings",
          version: 0,
        },
        () => {},
        undefined,
        model,
        undefined,
        { research: () => gate },
      );
      await vi.waitFor(() => {
        const saved = store.load(task.id, "owner");
        expect(saved.status).toBe("running");
        expect(saved.brief.version).toBe(1);
        expect(saved.messages.at(-1)).toMatchObject({
          role: "user",
          text: "Research recent market findings",
        });
      });

      // A newer correction advances the version while the old read-only
      // provider is still pending. The old result cannot overwrite it.
      const updated = store.load(task.id, "owner");
      updated.brief.goal = "Owner's newer correction";
      updated.brief.version++;
      store.save(updated, 1, "owner");

      releaseResearch({ status: "ok", sources, requests: 2 });
      await expect(pending).rejects.toThrow("newer");
      const persisted = store.load(task.id, "owner");
      expect(persisted.brief.goal).toBe("Owner's newer correction");
      expect(persisted.messages).toHaveLength(1);
      expect(persisted.evidence).toEqual([]);
      expect(persisted.brief.version).toBe(2);
    } finally {
      store.close();
    }
  });

  it("does not demote previously ready work after a successful read-only answer", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("research-preserve-ready", "owner");
    task.mode = "qloo-live";
    task.status = "ready";
    task.brief.goal = "Previously completed Qloo direction";
    store.create(task);

    try {
      const completed = await runTurn(
        store,
        task.id,
        "owner",
        { type: "message", text: "What is new this week?", version: 0 },
        () => {},
        undefined,
        {
          async routeConversation() {
            return { intent: "research" as const, query: "new this week" };
          },
          async synthesizeResearch() {
            return {
              text: "The retrieved source reports a development [web-1].",
              sourceIds: ["web-1"],
            };
          },
          async interpret() {
            throw new Error("No action planner needed");
          },
        },
        undefined,
        {
          async research() {
            return { status: "ok" as const, sources, requests: 2 };
          },
        },
      );
      expect(completed.status).toBe("ready");
      expect(completed.error).toBeNull();
      expect(completed.brief.goal).toBe(task.brief.goal);
      expect(completed.brief.version).toBe(2);
    } finally {
      store.close();
    }
  });

  it("reports failed research without invalidating a previously ready project", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("research-ready-blocked", "owner");
    task.status = "ready";
    task.brief.goal = "Approved cultural work";
    task.mode = "qloo-live";
    store.create(task);

    try {
      const result = await runTurn(
        store,
        task.id,
        "owner",
        {
          type: "message",
          text: "Check today's public updates",
          version: 0,
        },
        () => {},
        undefined,
        {
          async routeConversation() {
            return {
              intent: "research" as const,
              query: "today public updates",
            };
          },
          async interpret() {
            throw new Error("Should not call the work planner");
          },
        },
        undefined,
        {
          async research() {
            return {
              status: "blocked" as const,
              sources: [],
              requests: 0,
              warning: "Research provider access unavailable.",
            };
          },
        },
      );
      expect(result.status).toBe("ready");
      expect(result.brief.goal).toBe(task.brief.goal);
      expect(result.messages.at(-1)?.text).toContain(
        "Research provider access unavailable.",
      );
      expect(result.trace.map((trace) => trace.action)).toContain(
        "tool.result:search_web",
      );
      expect(store.load(task.id, "owner").status).toBe("ready");
    } finally {
      store.close();
    }
  });

  it("preserves existing work without fake sources when live research is blocked", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("research-blocked", "owner");
    task.mode = "qloo-live";
    task.brief.goal = "Existing saved project";
    store.create(task);
    const model = {
      routeConversation: vi.fn(async () => ({
        intent: "research" as const,
        query: "latest market changes",
      })),
      synthesizeResearch: vi.fn(),
      interpret: vi.fn(async () => {
        throw new Error("No full interpreter");
      }),
    };

    try {
      const result = await runTurn(
        store,
        task.id,
        "owner",
        { type: "message", text: "Latest market changes", version: 0 },
        () => {},
        undefined,
        model,
        undefined,
        {
          async research() {
            return {
              status: "blocked" as const,
              sources: [],
              requests: 0,
              warning: "Bright Data is not configured.",
            };
          },
        },
      );
      expect(result.brief.version).toBe(2);
      expect(result.brief.goal).toBe(task.brief.goal);
      expect(result.evidence).toEqual(task.evidence);
      expect(result.status).toBe("partial");
      expect(result.messages.at(-1)?.text).toContain("not configured");
      expect(model.synthesizeResearch).not.toHaveBeenCalled();
    } finally {
      store.close();
    }
  });

  it("rejects synthesized statements without any inline source ID", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("research-uncited", "owner");
    task.mode = "qloo-live";
    store.create(task);

    try {
      const result = await runTurn(
        store,
        task.id,
        "owner",
        {
          type: "message",
          text: "Research the latest information",
          version: 0,
        },
        () => {},
        undefined,
        {
          async routeConversation() {
            return {
              intent: "research" as const,
              query: "public developments",
            };
          },
          async synthesizeResearch() {
            return {
              text: "Unsupported summary without a cited passage.",
              sourceIds: ["web-1"],
            };
          },
          async interpret() {
            throw new Error("No full interpreter");
          },
        },
        undefined,
        {
          async research() {
            return { status: "ok" as const, sources, requests: 2 };
          },
        },
      );
      expect(result.messages.at(-1)?.text).not.toContain("Unsupported summary");
      expect(result.messages.at(-1)?.text).toContain("available evidence");
      expect(result.messages.at(-1)?.evidenceIds).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  it("never accepts invented citations from failed research synthesis", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("research-invalid", "owner");
    task.mode = "qloo-live";
    store.create(task);
    const model = {
      routeConversation: vi.fn(async () => ({
        intent: "research" as const,
        query: "public research",
      })),
      synthesizeResearch: vi.fn(async () => ({
        text: "Invented claim with unsupported source.",
        sourceIds: ["made-up-id"],
      })),
      interpret: vi.fn(async () => {
        throw new Error("No full interpreter");
      }),
    };

    try {
      const result = await runTurn(
        store,
        task.id,
        "owner",
        { type: "message", text: "Search the public web", version: 0 },
        () => {},
        undefined,
        model,
        undefined,
        {
          async research() {
            return {
              status: "ok" as const,
              sources,
              requests: 2,
            };
          },
        },
      );
      expect(result.status).toBe("partial");
      expect(result.evidence).toHaveLength(2);
      expect(result.messages.at(-1)?.text).not.toContain("Invented claim");
      expect(result.messages.at(-1)?.text).toContain("available evidence");
    } finally {
      store.close();
    }
  });
});
