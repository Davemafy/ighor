import { describe, expect, it, vi } from "vitest";
import { runTurn } from "../../src/core/orchestrator";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import { GeminiModel } from "../../src/tools/gemini-model";
import { ProviderHttpError } from "../../src/core/interpretation-failure";

const now = "2026-10-28T00:00:00.000Z";

describe("live clarification continuation recovery", () => {
  it("rescues New York → dining, Monopoly through a read-only Gemini call when the complex planner rejects its output", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("live-ny-followup", "owner");
    task.mode = "qloo-live";
    task.brief.goal = "Help plan a group outing in New York";
    task.brief.constraints.location = "New York";
    task.catalogue = [];
    task.messages = [
      { role: "user", text: "New york", at: now },
      {
        role: "assistant",
        kind: "conversation",
        text: "What kind of activities or interests are you and your group in the mood for?",
        at: now,
      },
    ];
    store.create(task);

    const tools: string[] = [];
    const response = (name: string, args: Record<string, unknown>) =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [{ functionCall: { name, args } }],
            },
          },
        ],
      });
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const raw = JSON.parse(String(init?.body));
      const name = raw.tools[0].functionDeclarations[0].name as string;
      tools.push(name);

      if (name === "route_conversation" && tools.length === 1) {
        return response(name, { intent: "delegate" });
      }
      if (name === "update_brief") {
        // Model failed the large planning contract, before any application
        // actions. This reproduces the user-visible generic-error boundary.
        return response("unauthorized_tool", {});
      }
      if (name === "route_conversation" && tools.length === 3) {
        return response(name, {
          intent: "conversation",
          reply:
            "Dining and Monopoly make a great dinner-and-games direction for New York. I haven't searched for real venues or verified availability yet. Would you prefer one venue with games or dinner followed by a game night?",
        });
      }
      throw new Error("Unexpected model call");
    });
    const model = new GeminiModel("offline-test", "gemini-3.5-flash-lite", transport);
    try {
      const result = await runTurn(
        store,
        task.id,
        "owner",
        { type: "message", text: "dining, monopoly", version: 0 },
        () => {},
        undefined,
        model,
      );
      expect(tools).toEqual([
        "route_conversation",
        "update_brief",
        "route_conversation",
      ]);
      expect(result.status).not.toBe("error");
      expect(result.error).toBeNull();
      expect(result.brief.goal).toBe(task.brief.goal);
      expect(result.brief.constraints.location).toBe("New York");
      expect(result.messages.at(-2)?.text).toBe("dining, monopoly");
      expect(result.messages.at(-1)?.text).toContain("Dining and Monopoly");
      expect(result.messages.at(-1)?.text).toContain("haven't searched");
      expect(result.candidates).toEqual([]);
      expect(result.evidence).toEqual([]);
      expect(result.trace.some((entry) => entry.action === "model.interpret.recovered")).toBe(true);
      const reload = store.load(task.id, "owner");
      expect(reload.messages.at(-1)?.text).toBe(result.messages.at(-1)?.text);
      expect(reload.brief.version).toBe(1);
      expect(reload.receipts?.at(-1)?.culturalRequests).toBe(0);
    } finally {
      store.close();
    }
  });

  it("tries the existing interpreter once after a malformed lightweight route", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("router-recover", "owner");
    task.mode = "qloo-live";
    store.create(task);
    const model = {
      routeConversation: vi.fn(async () => {
        throw new SyntaxError("Malformed read-only router JSON");
      }),
      interpret: vi.fn(async () => ({
        intent: "conversation" as const,
        reply: "Dining and Monopoly noted; no live places checked.",
      })),
    };
    try {
      const result = await runTurn(
        store, task.id, "owner",
        { type: "message", text: "dining, monopoly", version: 0 },
        () => {}, undefined, model,
      );
      expect(model.routeConversation).toHaveBeenCalledOnce();
      expect(model.interpret).toHaveBeenCalledOnce();
      expect(result.messages.at(-1)?.text).toContain("Dining and Monopoly noted");
      expect(result.trace.some((entry) => entry.action === "model.route.recovered")).toBe(true);
      expect(result.status).not.toBe("error");
    } finally {
      store.close();
    }
  });

  it("does not retry provider outages as expensive planner requests and classifies the error", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("provider-outage", "owner");
    task.mode = "qloo-live";
    store.create(task);
    const model = {
      routeConversation: vi.fn(async () => {
        throw new ProviderHttpError("Gemini", 503, "private upstream response");
      }),
      interpret: vi.fn(async () => {
        throw new Error("No planner attempt on provider outage");
      }),
    };
    try {
      const result = await runTurn(
        store, task.id, "owner",
        { type: "message", text: "dining, monopoly", version: 0 },
        () => {}, undefined, model,
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("temporarily unavailable");
      expect(result.messages.at(-1)?.text).toBe("dining, monopoly");
      expect(model.interpret).not.toHaveBeenCalled();
      expect(JSON.stringify(result.trace)).not.toContain("private upstream response");
    } finally {
      store.close();
    }
  });
  it("clicking Try again reuses the persisted failed user turn instead of duplicating it", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("retry-once", "owner");
    task.mode = "qloo-live";
    task.brief.goal = "An outing in New York";
    store.create(task);
    const fail = {
      async routeConversation() {
        throw new ProviderHttpError("Gemini", 503, "transient");
      },
      async interpret() {
        throw new Error("Should not run on outage");
      },
    };
    try {
      const first = await runTurn(
        store, task.id, "owner",
        { type: "message", text: "dining, monopoly", version: 0 },
        () => {}, undefined, fail,
      );
      expect(first.status).toBe("error");
      expect(first.messages.map((message) => message.text)).toEqual([
        "dining, monopoly",
      ]);

      const reply = {
        async routeConversation() {
          return {
            intent: "conversation" as const,
            reply: "Let's plan dining and Monopoly in New York.",
          };
        },
        async interpret() {
          throw new Error("Full planning should not run");
        },
      };
      const second = await runTurn(
        store, task.id, "owner",
        { type: "message", text: "dining, monopoly", version: first.brief.version },
        () => {}, undefined, reply,
      );
      expect(second.messages.map((message) => message.role)).toEqual([
        "user",
        "assistant",
      ]);
      expect(second.messages[0].text).toBe("dining, monopoly");
      expect(second.messages[1].text).toContain("Monopoly in New York");
      expect(second.error).toBeNull();
      expect(second.status).not.toBe("error");
      expect(store.load(task.id, "owner").messages).toHaveLength(2);
    } finally {
      store.close();
    }
  });

});
