import { describe, expect, it, vi } from "vitest";
import { agentResearchLoop } from "../../src/core/agent-research";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import { runTurn } from "../../src/core/orchestrator";
import { ToolCallingModel } from "../../src/tools/tool-model";
import type {
  ResearchProvider,
  ResearchResult,
} from "../../src/tools/live-research";

const initial: ResearchResult = {
  status: "partial",
  requests: 1,
  sources: [
    {
      id: "web-1",
      title: "Secondary source",
      url: "https://example.com/directory",
      snippet: "Directory overview only",
      retrievedAt: "2026-10-28T09:00:00Z",
    },
  ],
};

describe("genuine read-only agent observe / decide / act research", () => {
  it("observes a first search, chooses a different search, reads an observed result, and saves the evidence", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("agent-journey", "owner");
    task.mode = "qloo-live";
    store.create(task);
    const research: ResearchProvider = {
      research: vi.fn(async () => structuredClone(initial)),
      searchOnce: vi.fn(async () => ({
        status: "partial" as const,
        requests: 1,
        sources: [
          {
            id: "web-1",
            title: "Primary source",
            url: "https://venue.example.org/board-games",
            snippet: "Venue describes games available",
            retrievedAt: "2026-10-28T09:02:00Z",
          },
        ],
      })),
      readSource: vi.fn(async () => ({
        status: "ok" as const,
        requests: 1,
        excerpt:
          "Official venue page: games and food offered.\n![Games room](/photos/games.jpg)",
      })),
    };
    const choose = vi.fn(
      async (
        _question: string,
        sources: { id: string; excerpt?: string }[],
      ) => {
        if (sources.length === 1) {
          return {
            action: "search" as const,
            query: "official venues with board games",
          };
        }

        expect(sources.some((s) => s.id === "web-2")).toBe(true);
        expect(sources.find((s) => s.id === "web-2")?.excerpt).toBeUndefined();

        return { action: "read" as const, sourceId: "web-2" };
      },
    );
    const model = {
      routeConversation: vi.fn(async () => ({
        intent: "research" as const,
        query: "board game cafes New York",
      })),
      chooseResearchStep: choose,
      synthesizeResearch: vi.fn(
        async (_q: string, sources: { id: string; excerpt?: string }[]) => {
          expect(sources.find((s) => s.id === "web-2")?.excerpt).toContain(
            "Official venue",
          );

          return {
            text: "The venue's own page mentions games and food [web-2].",
            sourceIds: ["web-2"],
          };
        },
      ),
      async interpret() {
        throw new Error("Planner must not execute");
      },
    };

    try {
      const result = await runTurn(
        store,
        task.id,
        "owner",
        {
          type: "message",
          text: "Find actual board game cafe options",
          version: 0,
        },
        () => {},
        undefined,
        model,
        undefined,
        research,
      );
      expect(choose).toHaveBeenCalledTimes(2);
      expect(research.searchOnce).toHaveBeenCalledWith(
        "official venues with board games",
      );
      expect(research.readSource).toHaveBeenCalledWith(
        "https://venue.example.org/board-games",
      );
      expect(result.messages.at(-1)?.text).toContain("[web-2]");
      expect(
        result.evidence.find(
          (e) => e.reference === "https://venue.example.org/board-games",
        )?.summary,
      ).toContain("Official venue");
      expect(
        result.evidence.find(
          (e) => e.reference === "https://venue.example.org/board-games",
        )?.previewImageUrl,
      ).toBe("https://venue.example.org/photos/games.jpg");
      expect(result.trace.map((step) => step.action)).toEqual(
        expect.arrayContaining([
          "tool.invoke:agent_search",
          "tool.result:agent_search",
          "tool.invoke:agent_read",
          "tool.result:agent_read",
          "compose.research",
        ]),
      );
      expect(
        result.artifacts.some(
          (a) =>
            a.kind === "research-report" &&
            a.content.includes("https://venue.example.org/board-games"),
        ),
      ).toBe(true);
      expect(store.load(task.id, "owner").messages).toEqual(result.messages);
    } finally {
      store.close();
    }
  });

  it("rejects unobserved source IDs without invoking the reader", async () => {
    const research: ResearchProvider = {
      research: vi.fn(),
      readSource: vi.fn(),
      searchOnce: vi.fn(),
    };
    const events: string[] = [];
    const output = await agentResearchLoop(
      "Find trustworthy data",
      "board game cafes New York",
      initial,
      research,
      {
        chooseResearchStep: async () => ({
          action: "read",
          sourceId: "web-999",
        }),
        async interpret() {
          throw new Error("not used");
        },
      },
      freshTask("test", "owner"),
      (action) => {
        events.push(action);
      },
    );
    expect(output).toEqual(initial);
    expect(research.readSource).not.toHaveBeenCalled();
    expect(events).toContain("agent.action.blocked");
  });

  it("rejects repeated search queries before any provider call", async () => {
    const research: ResearchProvider = {
      research: vi.fn(),
      searchOnce: vi.fn(),
    };
    const result = await agentResearchLoop(
      "Find official venues",
      "board game cafes New York",
      initial,
      research,
      {
        chooseResearchStep: async () => ({
          action: "search",
          query: "Board Game Cafes New York",
        }),
        async interpret() {
          throw new Error("not used");
        },
      },
      freshTask("test", "owner"),
      () => {},
    );
    expect(result.requests).toBe(1);
    expect(research.searchOnce).not.toHaveBeenCalled();
  });

  it("stops after two model-directed actions with strict budget", async () => {
    const research: ResearchProvider = {
      research: vi.fn(),
      searchOnce: vi.fn(async () => ({
        status: "partial" as const,
        requests: 1,
        sources: [
          {
            id: "web-1",
            title: "New source",
            url: "https://example.org/updated",
            snippet: "New content",
            retrievedAt: "2026-10-28T09:00:00Z",
          },
        ],
      })),
    };
    const step = vi.fn(async () => ({
      action: "search" as const,
      query: "official updated venues",
    }));
    const output = await agentResearchLoop(
      "Explore",
      "board game cafes New York",
      initial,
      research,
      {
        chooseResearchStep: step,
        async interpret() {
          throw new Error("not used");
        },
      },
      freshTask("test", "owner"),
      () => {},
    );
    expect(step).toHaveBeenCalledTimes(2);
    expect(research.searchOnce).toHaveBeenCalledTimes(1);
    expect(output.sources).toHaveLength(2);
    expect(output.requests).toBe(2);
  });
  it("uses an actual validated model tool decision rather than hardcoded follow-ups", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.tools[0].name).toBe("choose_research_step");
      expect(JSON.stringify(request.input)).toContain("Secondary source");

      return Response.json({
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "choose_research_step",
            call_id: "decision-1",
            arguments: JSON.stringify({ action: "read", sourceId: "web-1" }),
          },
        ],
      });
    });
    const model = new ToolCallingModel(
      "secret-for-test",
      "test-model",
      transport,
    );
    const selected = await model.chooseResearchStep(
      "Find independent information",
      initial.sources,
      freshTask("test", "owner"),
      2,
    );
    expect(selected).toEqual({ action: "read", sourceId: "web-1" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects a model-generated page ID that was never observed", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "choose_research_step",
            call_id: "decision-bad",
            arguments: JSON.stringify({ action: "read", sourceId: "web-200" }),
          },
        ],
      }),
    );
    const model = new ToolCallingModel(
      "secret-for-test",
      "test-model",
      transport,
    );
    await expect(
      model.chooseResearchStep(
        "Find a real source",
        initial.sources,
        freshTask("test", "owner"),
        2,
      ),
    ).rejects.toThrow("ungrounded");
  });
});
