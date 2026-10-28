import { describe, expect, it, vi } from "vitest";
import { LiveQlooProvider, MemoryResponseCache } from "../../src/tools/qloo-live";
import { runTurn } from "../../src/core/orchestrator";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";

const at = "2026-10-28T12:00:00Z";
const rows = {
  results: {
    entities: [
      {
        entity_id: "7c51bb20-a1d8-4fd4-96a7-e05e93c0d0a2",
        name: "The Game Table",
        type: "urn:entity:place",
        properties: {
          website: "https://example.org/gametable",
          address: "Example Street, New York",
        },
        location: { lat: 40.72, lon: -73.99 },
      },
    ],
  },
  query: {
    localities: {
      filter: [
        {
          entity_id: "abcc772e-5f23-441d-a2a1-0ef0c8749d51",
          name: "New York",
        },
      ],
    },
  },
};

describe("Qloo place exploration without a fabricated media taste seed", () => {
  it("requests Qloo Insights using verified location and restaurant category, not fake personalization", async () => {
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      const request = new URL(String(url));
      expect(request.pathname).toBe("/v2/insights");
      expect(request.searchParams.get("filter.type")).toBe("urn:entity:place");
      expect(request.searchParams.get("filter.location.query")).toBe("New York");
      expect(request.searchParams.get("filter.tags")).toBe("urn:tag:genre:place:restaurant");
      expect(request.searchParams.has("signal.interests.entities")).toBe(false);
      expect(new Headers(init?.headers).get("X-Api-Key")).toBe("fake-key");
      return Response.json(rows);
    });
    const provider = new LiveQlooProvider(
      "fake-key",
      new MemoryResponseCache(),
      transport,
    );
    const output = await provider.exploreLocality("New York", "dinning, monopoly");
    expect(output.status).toBe("ok");
    expect(output.data.places).toEqual([
      expect.objectContaining({
        name: "The Game Table",
        address: "Example Street, New York",
      }),
    ]);
    expect(output.data.evidence[0].limitations.join(" ")).toContain(
      "not personalized taste affinity",
    );
    expect(output.data.evidence[0].limitations.join(" ")).toContain(
      "Board games",
    );
    expect(output.requestCount).toBe(1);
    expect(transport).toHaveBeenCalledOnce();
  });

  it("fails closed if Qloo doesn't confirm an unambiguous locality", async () => {
    const provider = new LiveQlooProvider(
      "fake-key",
      new MemoryResponseCache(),
      async () => Response.json({ ...rows, query: {} }),
    );
    const result = await provider.exploreLocality("New York", "dining");
    expect(result.status).toBe("partial");
    expect(result.data.places).toEqual([]);
    expect(result.data.evidence).toEqual([]);
  });

  it("combines Qloo place leads and Bright Data sources into one saved result without a booking claim", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("multi-provider-outing", "owner");
    task.mode = "qloo-live";
    task.catalogue = [];
    task.messages = [
      { role: "user", text: "Plan a fun Saturday outing with my friends", at },
      { role: "assistant", text: "Which city are you in?", at },
      { role: "user", text: "New York", at },
      { role: "assistant", text: "What activities or interests are you in the mood for?", at },
    ];
    store.create(task);
    const provider = new LiveQlooProvider(
      "fake-key",
      new MemoryResponseCache(),
      async () => Response.json(rows),
    );
    try {
      const result = await runTurn(
        store,
        task.id,
        "owner",
        { type: "message", text: "dining and board games", version: 0 },
        () => {},
        provider,
        {
          async routeConversation() {
            return { intent: "clarification" as const, reply: "What budget?" };
          },
          async synthesizeResearch() {
            return {
              text: "A search result mentions a game cafe, but availability is not confirmed [web-1].",
              sourceIds: ["web-1"],
            };
          },
          async interpret() {
            throw new Error("Intake loop should not run");
          },
        },
        undefined,
        {
          async research() {
            return {
              status: "ok" as const,
              requests: 1,
              sources: [
                {
                  id: "web-1",
                  title: "Local game cafes",
                  url: "https://example.org/cafes",
                  snippet: "Board games and snacks",
                  retrievedAt: at,
                },
              ],
            };
          },
        },
      );
      expect(result.trace.map(t => t.action)).toContain("tool.invoke:qloo_locality");
      expect(result.trace.map(t => t.action)).toContain("tool.invoke:search_web");
      expect(result.trace.map(t => t.action)).toContain("compose.research");
      expect(result.messages.at(-1)?.text).toContain("The Game Table");
      expect(result.messages.at(-1)?.text).toContain("bookings unverified");
      expect(result.artifacts.at(-1)?.content).toContain("## Qloo location and restaurant-category results");
      expect(result.artifacts.at(-1)?.content).toContain("https://example.org/cafes");
      expect(result.evidence.some(e => e.kind === "cultural" && e.summary.includes("The Game Table"))).toBe(true);
      expect(result.evidence.some(e => e.kind === "practical" && e.reference.includes("cafes"))).toBe(true);
      expect(result.receipts?.at(-1)?.culturalRequests).toBe(1);
    } finally {
      store.close();
    }
  });
});
