import { describe, expect, it, vi } from "vitest";
import { practicalDiscoveryOpportunity } from "../../src/core/action-readiness";
import { runTurn } from "../../src/core/orchestrator";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";

const at = "2026-10-28T10:00:00Z";
const transcript = [
  { role: "user" as const, text: "Help me plan something with friends. Ask about our location, interests and constraints.", at },
  { role: "assistant" as const, text: "Where are you and your friends located, and what is the budget and date?", at },
  { role: "user" as const, text: "50$, 5, saturday", at },
  { role: "assistant" as const, text: "Where are you located?", at },
  { role: "user" as const, text: "New york", at },
  { role: "assistant" as const, text: "What kind of activities or interests are you and your group in the mood for?", at },
];

const sources = [
  {
    id: "web-1",
    title: "A board game cafe — official website",
    url: "https://example.org/games",
    snippet: "Board games and snacks; check current fees and availability.",
    retrievedAt: at,
  },
  {
    id: "web-2",
    title: "Local venues overview",
    url: "https://example.net/venues",
    snippet: "Local board-game outing reference.",
    retrievedAt: at,
  },
];

describe("action-first practical agent planning", () => {
  it("uses the real thread's interests and location to trigger discovery, including an open-ended preference", () => {
    const task = freshTask("planning-ready", "owner");
    task.messages = [...transcript, { role: "user", text: "dinning, monopoly", at }];
    const plan = practicalDiscoveryOpportunity(task, "dinning, monopoly");
    expect(plan).toBeTruthy();
    expect(plan?.query).toMatch(/New york/i);
    expect(plan?.query).toContain("dinning, monopoly");
    expect(plan?.query).toContain("saturday");
    expect(practicalDiscoveryOpportunity(task, "explain JavaScript")).toBeNull();
  });

  it("turns a conversational model response into live source research and an editable saved artifact", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("friends-outing", "owner");
    task.mode = "qloo-live";
    task.catalogue = [];
    task.messages = [...transcript];
    store.create(task);
    const cultural = {
      resolve: vi.fn(async () => { throw Error("Qloo must not manufacture a taste seed"); }),
      discover: vi.fn(async () => { throw Error("Qloo must not manufacture a taste seed"); }),
    };
    const research = {
      research: vi.fn(async (_query: string) => ({ status: "ok" as const, sources, requests: 2 })),
    };
    const model = {
      routeConversation: vi.fn(async () => ({
        intent: "clarification" as const,
        reply: "Which borough in New York?",
      })),
      synthesizeResearch: vi.fn(async () => ({
        text: "A board-game cafe is one lead for this outing [web-1]. Check pricing and group seating directly.",
        sourceIds: ["web-1"],
      })),
      interpret: vi.fn(async () => {
        throw Error("The large intake/planner must not be called");
      }),
    };
    try {
      const next = await runTurn(
        store,
        task.id,
        "owner",
        { type: "message", text: "dinning, monopoly", version: 0 },
        () => {},
        cultural,
        model,
        undefined,
        research,
      );
      expect(model.routeConversation).toHaveBeenCalledOnce();
      expect(model.interpret).not.toHaveBeenCalled();
      expect(research.research).toHaveBeenCalledOnce();
      const query = vi.mocked(research.research).mock.calls[0][0];
      expect(query).toContain("New york");
      expect(query).toContain("monopoly");
      expect(next.messages.at(-1)?.text).toContain("[web-1]");
      expect(next.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "research-report",
            freshness: "current",
            evidenceIds: ["friends-outing:web:1:web-1", "friends-outing:web:1:web-2"],
            content: expect.stringContaining("https://example.org/games"),
          }),
        ]),
      );
      expect(next.canvas?.surface.nodes.some(node => node.type === "document")).toBe(true);
      expect(next.trace.map(t => t.action)).toContain("compose.research");
      expect(next.trace.map(t => t.action)).toContain("tool.invoke:search_web");
      expect(next.trace.map(t => t.action)).not.toContain("cultural.discover");
      expect(cultural.discover).not.toHaveBeenCalled();
      expect(store.load(task.id, "owner").artifacts).toEqual(next.artifacts);
      expect(next.receipts?.at(-1)?.culturalRequests).toBe(0);
    } finally {
      store.close();
    }
  });

  it("executes 'show me' using the existing context instead of claiming a plan exists", async () => {
    const task = freshTask("followup", "owner");
    task.messages = [
      ...transcript,
      { role: "user", text: "dinning, monopoly", at },
      { role: "assistant", text: "Would you prefer a dedicated game cafe?", at },
      { role: "user", text: "former", at },
      { role: "assistant", text: "Okay, I'll check some options.", at },
      { role: "user", text: "show me", at },
    ];
    const plan = practicalDiscoveryOpportunity(task, "show me");
    expect(plan).toBeTruthy();
    expect(plan?.query).toContain("New york");
    expect(plan?.query).toContain("dinning, monopoly");
  });

  it("recovers the original actionable goal after a long unproductive interview", () => {
    const task = freshTask("stalled-but-actionable", "owner");
    task.messages = [
      ...transcript,
      { role: "user", text: "dinning, monopoly", at },
      { role: "assistant", text: "Do you prefer a dedicated board game cafe or restaurant?", at },
      { role: "user", text: "former", at },
    ];
    expect(practicalDiscoveryOpportunity(task, "former")?.query).toContain("New york");

    // Repeated non-actions must not erase the original user intent.
    for (let i = 0; i < 14; i++) {
      task.messages.push(
        { role: "assistant", text: "Would you like me to show some venues?", at },
        { role: "user", text: "yeah", at },
      );
    }
    task.messages.push(
      { role: "assistant", text: "Let me know if you need anything else.", at },
      { role: "user", text: "show me", at },
    );
    expect(task.messages.length).toBeGreaterThan(24);
    expect(practicalDiscoveryOpportunity(task, "show me")?.query).toContain("dinning, monopoly");

    task.messages.push(
      { role: "assistant", text: "Which neighborhood?", at },
      { role: "user", text: "okay go too many questions", at },
    );
    expect(practicalDiscoveryOpportunity(task, "okay go too many questions")?.query).toContain("New york");
  });

  it("does not force external research for ordinary talk, unknown cities, or unrelated creative tasks", () => {
    const task = freshTask("not-ready", "owner");
    task.messages = [
      { role: "user", text: "Can you explain an API?", at },
      { role: "assistant", text: "Sure, here's what an API is.", at },
      { role: "user", text: "show me", at },
    ];
    expect(practicalDiscoveryOpportunity(task, "show me")).toBeNull();
    task.messages = [
      { role: "user", text: "Plan an outing for friends", at },
      { role: "assistant", text: "What activities interest you?", at },
      { role: "user", text: "jazz, ramen", at },
    ];
    expect(practicalDiscoveryOpportunity(task, "jazz, ramen")).toBeNull();
  });
});
