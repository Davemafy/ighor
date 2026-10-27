import { describe, expect, it, vi } from "vitest";
import { ResponsiveGeminiModel } from "../../src/tools/responsive-gemini";
import { freshTask } from "../../src/data/fixtures";

function result(tool: string, args: object) {
  return Response.json({
    candidates: [{
      finishReason: "STOP",
      content: {
        role: "model",
        parts: [{
          functionCall: { name: tool, id: "call-1", args },
        }],
      },
    }],
  });
}

describe("responsive first-turn routing", () => {
  it("asks one natural question without a huge agent schema or false work", async () => {
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.tools[0].functionDeclarations[0].name).toBe("route_conversation");
      expect(JSON.stringify(payload)).not.toContain("workActions exact schema");
      return result("route_conversation", {
        intent: "clarification",
        reply: "Where will you and your friends be meeting?",
      });
    });
    const task = freshTask("t", "owner");
    const model = new ResponsiveGeminiModel("key", "gemini-test", transport as typeof fetch);
    const decision = await model.interpret(
      "Help me plan with friends. Ask about location, interests and constraints.",
      task,
    );
    expect(decision.intent).toBe("clarification");
    if (decision.intent !== "clarification") throw Error("Expected a clarification.");
    expect(decision.reply).toBe("Where will you and your friends be meeting?");
    expect(decision.replyEvidenceIds).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("delegates actionable requests to the complete bounded agent contract", async () => {
    const tools: string[] = [];
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      const name = payload.tools[0].functionDeclarations[0].name as string;
      tools.push(name);
      return name === "route_conversation"
        ? result(name, { intent: "delegate" })
        : result(name, { decision: { intent: "conversation", reply: "I can start with a supported creative brief." } });
    });
    const task = freshTask("t", "owner");
    const model = new ResponsiveGeminiModel("key", "gemini-test", transport as typeof fetch);
    const decision = await model.interpret("Create an original visual concept", task);
    expect(decision.intent).toBe("conversation");
    expect(tools).toEqual(["route_conversation", "update_brief"]);
    expect(model.calls).toBe(2);
  });

  it("uses full prior context rather than treating later corrections as fresh turns", async () => {
    const tools: string[] = [];
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      const name = payload.tools[0].functionDeclarations[0].name as string;
      tools.push(name);
      return result(name, { decision: { intent: "conversation", reply: "I meant your existing plan." } });
    });
    const task = freshTask("t", "owner");
    task.messages = [{role:"user",text:"Help me plan a weekend.",at:"2026-10-27T00:00:00.000Z"}];
    const model = new ResponsiveGeminiModel("key", "gemini-test", transport as typeof fetch);
    const decision = await model.interpret("No, keep the original idea", task);
    expect(decision.intent).toBe("conversation");
    expect(tools).toEqual(["update_brief"]);
  });
});
