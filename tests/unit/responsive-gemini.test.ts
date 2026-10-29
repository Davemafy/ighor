import { describe, expect, it, vi } from "vitest";
import { ResponsiveGeminiModel } from "../../src/tools/responsive-gemini";
import { freshTask } from "../../src/data/fixtures";

function result(tool: string, args: object) {
  return Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          role: "model",
          parts: [
            {
              functionCall: { name: tool, id: "call-1", args },
            },
          ],
        },
      },
    ],
  });
}

describe("read-only conversation routing across the entire thread", () => {
  it("answers an ordinary first turn without loading the full work schema", async () => {
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.tools[0].functionDeclarations[0].name).toBe(
        "route_conversation",
      );
      expect(JSON.stringify(payload)).not.toContain("workActions exact schema");

      return result("route_conversation", {
        intent: "clarification",
        reply: "Where will you and your friends be meeting?",
      });
    });
    const task = freshTask("t", "owner");
    const model = new ResponsiveGeminiModel(
      "key",
      "gemini-test",
      transport as typeof fetch,
    );
    const decision = await model.routeConversation(
      "Help me plan with friends. Ask about location, interests and constraints.",
      task,
    );
    expect(decision).toMatchObject({
      intent: "clarification",
      reply: "Where will you and your friends be meeting?",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("delegates actionable work to the full validated decision protocol", async () => {
    const tools: string[] = [];
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      const name = payload.tools[0].functionDeclarations[0].name as string;
      tools.push(name);

      return name === "route_conversation"
        ? result(name, { intent: "delegate" })
        : result(name, {
            decision: {
              intent: "conversation",
              reply: "I can start with a supported creative brief.",
            },
          });
    });
    const task = freshTask("t", "owner");
    const model = new ResponsiveGeminiModel(
      "key",
      "gemini-test",
      transport as typeof fetch,
    );
    expect(
      await model.routeConversation("Create an original visual concept", task),
    ).toBeNull();
    const decision = await model.interpret(
      "Create an original visual concept",
      task,
    );
    expect(decision.intent).toBe("conversation");
    expect(tools).toEqual(["route_conversation", "update_brief"]);
    expect(model.calls).toBe(2);
  });

  it("routes later corrections with prior context, not first-turn assumptions", async () => {
    const tools: string[] = [];
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      const name = payload.tools[0].functionDeclarations[0].name as string;
      tools.push(name);
      expect(JSON.stringify(payload)).toContain("Help me plan a weekend.");

      return result(name, {
        intent: "conversation",
        reply: "The original plan is still saved. We can discuss it.",
      });
    });
    const task = freshTask("t", "owner");
    task.messages = [
      {
        role: "user",
        text: "Help me plan a weekend.",
        at: "2026-10-27T00:00:00.000Z",
      },
    ];
    const model = new ResponsiveGeminiModel(
      "key",
      "gemini-test",
      transport as typeof fetch,
    );
    const decision = await model.routeConversation(
      "Can we discuss that?",
      task,
    );
    expect(decision).toMatchObject({
      intent: "conversation",
      reply: "The original plan is still saved. We can discuss it.",
    });
    expect(tools).toEqual(["route_conversation"]);
  });

  it("delegates explanations with invented evidence IDs instead of citing them", async () => {
    const model = new ResponsiveGeminiModel("key", "gemini-test", async () =>
      result("route_conversation", {
        intent: "conversation",
        reply: "I recommend it because of a verified cultural signal.",
        replyEvidenceIds: ["invented-qloo-source"],
      }),
    );
    expect(
      await model.routeConversation(
        "Why this option?",
        freshTask("t", "owner"),
      ),
    ).toBeNull();
  });

  it("routes current-information questions to bounded live research", async () => {
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.tools[0].functionDeclarations[0].name).toBe(
        "route_conversation",
      );

      return result("route_conversation", {
        intent: "research",
        query: "2026 publicly released cultural report",
      });
    });
    const model = new ResponsiveGeminiModel(
      "key",
      "gemini-test",
      transport as typeof fetch,
    );
    expect(
      await model.routeConversation(
        "Find the latest public cultural report",
        freshTask("t", "owner"),
      ),
    ).toEqual({
      intent: "research",
      query: "2026 publicly released cultural report",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects an invented completed action even with a contracted reply", async () => {
    const model = new ResponsiveGeminiModel("key", "gemini-test", async () =>
      result("route_conversation", {
        intent: "conversation",
        reply: "I've booked the table for your group.",
      }),
    );
    expect(
      await model.routeConversation(
        "Can you book the table?",
        freshTask("t", "owner"),
      ),
    ).toBeNull();
  });

  it("rejects a quick reply claiming a completed external action", async () => {
    const model = new ResponsiveGeminiModel("key", "gemini-test", async () =>
      result("route_conversation", {
        intent: "conversation",
        reply: "I booked your flight.",
      }),
    );
    expect(
      await model.routeConversation("Book my flight", freshTask("t", "owner")),
    ).toBeNull();
  });
});

it("honors Gemini's configured deadline for a route that returns after the old 14-second cutoff", async () => {
  vi.useFakeTimers();
  const timeout = vi
    .spyOn(AbortSignal, "timeout")
    .mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException("Timed out", "TimeoutError")),
        milliseconds,
      );

      return controller.signal;
    });
  const transport = vi.fn(
    async (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            resolve(
              result("route_conversation", {
                intent: "agent",
                query: "Create a source-backed experience",
              }),
            ),
          15000,
        );
        init?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("transport timeout"));
          },
          { once: true },
        );
      }),
  );

  try {
    const model = new ResponsiveGeminiModel("key", "gemini-test", transport);
    const pending = model.routeConversation(
      "Create an experience",
      freshTask("slow-route", "owner"),
    );
    const expected = expect(pending).resolves.toMatchObject({
      intent: "research",
      query: "Create a source-backed experience",
    });
    await vi.advanceTimersByTimeAsync(15001);
    await expected;
    expect(transport).toHaveBeenCalledTimes(1);
  } finally {
    timeout.mockRestore();
    vi.useRealTimers();
  }
});
