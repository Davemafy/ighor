import { expect, it, vi } from "vitest";
import { z } from "zod";
import { GeminiModel } from "../../src/tools/gemini-model";
import { LiveDecisionSchema } from "../../src/core/contracts";

function response(decision: unknown, index = 1) {
  return Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          role: "model",
          parts: [
            {
              functionCall: {
                name: "update_brief",
                id: `call-${index}`,
                args: { decision: JSON.stringify(decision) },
              },
              thoughtSignature: `signature-${index}`,
            },
          ],
        },
      },
    ],
  });
}

function modelWithActions(actions: unknown) {
  const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const schema = body.tools[0].functionDeclarations[0].parametersJsonSchema;
    expect(Object.keys(schema.properties)).toEqual(["decision"]);
    expect(schema.required).toEqual(["decision"]);
    const description = schema.properties.decision.description as string;
    expect(description).toContain("optional");
    const schemaJson = description.slice(description.indexOf("{"));
    expect(JSON.parse(schemaJson)).toEqual(
      z.toJSONSchema(LiveDecisionSchema, { io: "input" }),
    );

    return response({
      supported: true,
      intent: "goal",
      kind: "discovery",
      goal: "Find films",
      targetType: "movie",
      actions,
    });
  });

  return new GeminiModel(
    "test-private-key",
    "gemini-test",
    transport as typeof fetch,
  );
}

it("uses the same canonical contract for the provider and engine", async () => {
  const actions = [
    {
      kind: "profile",
      participant: "you",
      preferences: [
        { value: "Radiohead", polarity: "like", entityType: "artist" },
      ],
    },
  ];
  const result = await modelWithActions(actions).interpret(
    "I like Radiohead. Find films.",
  );
  expect(result.actions).toEqual(actions);
});

it("rejects unknown operations and oversized batches after one bounded repair", async () => {
  await expect(
    modelWithActions([
      { kind: "fetch_url", url: "https://example.com" },
    ]).interpret("x"),
  ).rejects.toThrow();
  await expect(
    modelWithActions(
      Array.from({ length: 9 }, () => ({ kind: "select", candidates: [] })),
    ).interpret("x"),
  ).rejects.toThrow();
});

it("accepts discussion without planning fields and includes earlier thread history", async () => {
  const { freshTask } = await import("../../src/data/fixtures");
  const task = freshTask("thread", "private-owner");
  task.messages = Array.from({ length: 14 }, (_, index) => ({
    role: "user" as const,
    text:
      index === 0 ? "This is for our anniversary" : `Earlier exchange ${index}`,
    at: new Date().toISOString(),
  }));
  const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(JSON.stringify(body)).toContain("This is for our anniversary");
    expect(JSON.stringify(body)).not.toContain("private-owner");

    return response({
      intent: "conversation",
      reply: "You said this is for your anniversary.",
    });
  });
  const result = await new GeminiModel(
    "test-private-key",
    "gemini-test",
    transport as typeof fetch,
  ).interpret("What occasion?", task);
  expect(result.intent).toBe("conversation");
  expect(result.actions).toBeUndefined();
});

it("repairs malformed decisions once while preserving function IDs and signatures", async () => {
  let calls = 0;
  const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
    calls++;

    if (calls === 1) {
      return response({ intent: "goal", goal: "A weekend trip" });
    }

    const body = JSON.parse(String(init?.body));
    expect(body.contents[1].parts[0].thoughtSignature).toBe("signature-1");
    expect(body.contents[2].parts[0].functionResponse.id).toBe("call-1");
    expect(
      body.contents[2].parts[0].functionResponse.response.result.status,
    ).toBe("rejected");

    return response(
      { intent: "clarification", reply: "Where would you like to go?" },
      2,
    );
  });
  const model = new GeminiModel(
    "test-private-key",
    "gemini-test",
    transport as typeof fetch,
  );
  const result = await model.interpret("planning a weekend trip with friends");
  expect(result.intent).toBe("clarification");
  expect(model.calls).toBe(2);
});

it("does not retry transport errors", async () => {
  const transport = vi.fn(async () => new Response(null, { status: 429 }));
  const model = new GeminiModel(
    "test-private-key",
    "gemini-test",
    transport as typeof fetch,
  );
  await expect(model.interpret("A weekend trip")).rejects.toThrow("HTTP 429");
  expect(transport).toHaveBeenCalledTimes(1);
});

it("repairs out-of-thread citations without accepting unsupported evidence", async () => {
  const { freshTask } = await import("../../src/data/fixtures");
  let calls = 0;
  const transport = vi.fn(async () => {
    calls++;

    return response(
      calls === 1
        ? {
            intent: "conversation",
            reply: "A claimed explanation",
            replyEvidenceIds: ["unknown-source"],
          }
        : {
            intent: "conversation",
            reply: "There is no retrieved evidence in this thread yet.",
          },
      calls,
    );
  });
  const model = new GeminiModel(
    "test-private-key",
    "gemini-test",
    transport as typeof fetch,
  );
  const result = await model.interpret(
    "Explain the evidence",
    freshTask("t", "o"),
  );
  expect(result.intent).toBe("conversation");
  expect("replyEvidenceIds" in result && result.replyEvidenceIds).toEqual([]);
  expect(model.calls).toBe(2);
});
