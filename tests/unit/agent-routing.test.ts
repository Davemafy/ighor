import { describe, expect, it, vi } from "vitest";
import { runTurn } from "../../src/core/orchestrator";
import { interpretMessage } from "../../src/core/interpret-message";
import { ExecutionBudget } from "../../src/core/execution";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import { FallbackModel } from "../../src/tools/fallback-model";
import { ProviderHttpError } from "../../src/core/interpretation-failure";
import { GrokModel } from "../../src/tools/grok-model";

function grokToolResponse(name: string, callId: string, args: object): Response {
  return Response.json({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "grok-4.3",
    choices: [{
      index: 0,
      finish_reason: "tool_calls",
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: callId,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        }],
      },
    }],
    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
  });
}

describe("agent conversation reliability", () => {
  it("preserves 50 topic-switching conversational turns after SQLite reloads", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("long-thread", "owner");
    task.mode = "qloo-live";
    task.brief.goal = "Keep the original saved creative project";
    store.create(task);
    const research = {
      async resolve() {
        throw new Error("Ordinary conversation must not run Qloo");
      },
      async discover() {
        throw new Error("Ordinary conversation must not run Qloo");
      },
    };
    const model = {
      calls: 0,
      async routeConversation(message: string) {
        this.calls++;
        return {
          intent: "conversation" as const,
          reply: `Responding to: ${message}`,
        };
      },
      async interpret() {
        throw new Error("Heavy planning must not run on a conversation");
      },
    };

    try {
      const subjects = [
        "Hey",
        "Explain JavaScript closures",
        "I have a completely different idea",
        "Why did we prefer the first option?",
        "Go back to our earlier idea",
      ];
      for (let index = 0; index < 50; index++) {
        const current = store.load(task.id, "owner");
        const message = `${subjects[index % subjects.length]} (turn ${index + 1})`;
        const response = await runTurn(
          store,
          task.id,
          "owner",
          { type: "message", text: message, version: current.brief.version },
          () => {},
          research,
          model,
        );
        expect(response.brief.version).toBe(index + 1);
        expect(response.error).toBeNull();
        expect(response.messages.at(-1)?.text).toBe(
          `Responding to: ${message}`,
        );
        expect(response.brief.goal).toBe(task.brief.goal);
      }

      const resumed = store.load(task.id, "owner");
      expect(resumed.messages).toHaveLength(100);
      expect(resumed.brief.version).toBe(50);
      expect(resumed.brief.goal).toBe(task.brief.goal);
      expect(resumed.receipts?.at(-1)?.culturalRequests).toBe(0);
      expect(model.calls).toBe(50);
    } finally {
      store.close();
    }
  });

  it("delegates changes instead of allowing a lightweight route to mutate state", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("delegate", "owner");
    task.mode = "qloo-live";
    store.create(task);
    const model = {
      routeConversation: vi.fn(async () => null),
      interpret: vi.fn(async () => ({
        intent: "conversation" as const,
        reply: "Let's first establish the scope of this change.",
      })),
    };
    try {
      const result = await runTurn(
        store,
        task.id,
        "owner",
        { type: "message", text: "Change the budget", version: 0 },
        () => {},
        undefined,
        model,
      );
      expect(model.routeConversation).toHaveBeenCalledTimes(1);
      expect(model.interpret).toHaveBeenCalledTimes(1);
      expect(result.brief.constraints).toEqual(task.brief.constraints);
      expect(result.brief.version).toBe(1);
    } finally {
      store.close();
    }
  });

  it("preserves the original state and user message on read-only routing failure", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("route-error", "owner");
    task.mode = "qloo-live";
    store.create(task);
    try {
      const result = await runTurn(
        store,
        task.id,
        "owner",
        { type: "message", text: "Hey", version: 0 },
        () => {},
        undefined,
        {
          async routeConversation() {
            throw new ProviderHttpError("Gemini", 503, "secret body");
          },
          async interpret() {
            throw new Error("Do not retry a failing provider as an edit");
          },
        },
      );
      expect(result.status).toBe("error");
      expect(result.messages.at(-1)).toMatchObject({
        role: "user",
        text: "Hey",
      });
      expect(result.brief.goal).toBe(task.brief.goal);
      expect(result.trace.at(-1)?.outcome).not.toContain("secret body");
    } finally {
      store.close();
    }
  });

  it("never routes an explicitly grounded canvas answer as casual conversation", async () => {
    const task = freshTask("form-followup", "owner");
    const model = {
      routeConversation: vi.fn(async () => {
        throw new Error("Form answers must reach the full interpreter");
      }),
      interpret: vi.fn(async () => ({
        intent: "conversation" as const,
        reply: "The supplied answer can now guide the saved task.",
      })),
    };
    const update = await interpretMessage(
      task,
      { type: "message", text: "Location: Paris", version: 0 },
      model,
      new ExecutionBudget(),
      () => {},
      { subject: "you", values: ["Paris"], constraints: { location: "Paris" } },
    );
    expect(model.routeConversation).not.toHaveBeenCalled();
    expect(model.interpret).toHaveBeenCalledTimes(1);
    expect(update.conversationOnly).toBe(true);
    expect(update.interpretationFailed).not.toBe(true);
  });

  it("uses the read-only backup for transient provider failure without retrying writes", async () => {
    const primary = {
      async routeConversation() {
        throw new ProviderHttpError("Gemini", 503, "upstream");
      },
      async interpret() {
        throw new Error("No full execution expected");
      },
    };
    const backup = {
      routeConversation: vi.fn(async () => ({
        intent: "conversation" as const,
        reply: "Your previous decision remains intact.",
      })),
      async interpret() {
        throw new Error("No full execution expected");
      },
    };
    const model = new FallbackModel(primary, backup);
    expect(await model.routeConversation("What happened?")).toMatchObject({
      intent: "conversation",
      reply: "Your previous decision remains intact.",
    });
    expect(backup.routeConversation).toHaveBeenCalledTimes(1);
  });

  it("uses Grok's existing SDK transport for source-bound research synthesis", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      // xAI Chat Completions is stateless; the SDK omits the Responses-API store flag.
      expect(body.store).not.toBe(true);
      expect(body.tools[0].function.name).toBe("submit_research_answer");
      return grokToolResponse("submit_research_answer", "research-answer", {
        text: "The source reports the announcement [web-1].",
        sourceIds: ["web-1"],
      });
    });
    const model = new GrokModel("test-key", "grok-4.3", transport);
    const source = {
      id: "web-1",
      title: "Official release",
      url: "https://example.org/news",
      snippet: "Announcement details",
      retrievedAt: "2026-10-27T00:00:00.000Z",
    };
    expect(
      await model.synthesizeResearch(
        "What changed?",
        [source],
        freshTask("t", "owner"),
      ),
    ).toEqual({
      text: "The source reports the announcement [web-1].",
      sourceIds: ["web-1"],
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("makes a small read-only Grok route call with storage disabled", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      // A stateless Chat Completions request does not require store: false.
      expect(request.store).not.toBe(true);
      expect(request.tools[0].function.name).toBe("route_conversation");
      return grokToolResponse("route_conversation", "route-call", {
        intent: "conversation",
        reply: "Hello. What are you exploring?",
      });
    });
    const model = new GrokModel("test-key", "grok-4.3", transport);
    const result = await model.routeConversation("Hey", freshTask("t", "owner"));
    expect(result).toMatchObject({
      intent: "conversation",
      reply: "Hello. What are you exploring?",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
