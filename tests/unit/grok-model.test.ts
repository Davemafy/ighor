import { afterEach, expect, it, vi } from "vitest";
import { GrokModel } from "../../src/tools/grok-model";
import { runtimeModelProvider } from "../../src/tools/runtime";
import { FallbackModel } from "../../src/tools/fallback-model";

afterEach(() => vi.unstubAllEnvs());
const completed = (
  decision: unknown = { intent: "conversation", reply: "Hello" },
  id = "grok-call",
) =>
  Response.json({
    id: "chat-test",
    object: "chat.completion",
    created: 1,
    model: "grok-4.3",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id,
              type: "function",
              function: {
                name: "update_brief",
                arguments: JSON.stringify({ decision }),
              },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  });
it("uses client-side tool Chat Completions without Responses-only fields", async () => {
  const transport = vi.fn<typeof fetch>(async () => completed());
  const model = new GrokModel("test-grok-secret", "grok-4.3", transport);
  expect(await model.interpret("Hello")).toMatchObject({
    intent: "conversation",
    reply: "Hello",
  });
  expect(transport.mock.calls[0][0]).toBe(
    "https://api.x.ai/v1/chat/completions",
  );
  const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    model: "grok-4.3",
    tool_choice: "required",
    parallel_tool_calls: false,
  });
  expect(body).not.toHaveProperty("include");
  expect(body).not.toHaveProperty("previous_response_id");
  expect(body.tools[0].function.strict).toBe(false);
});
it("preserves safe schema diagnostics without retaining provider content", async () => {
  const model = new GrokModel(
    "test-grok-secret",
    "grok-4.3",
    async () =>
      new Response("unsupported parameters schema. private-user-data", {
        status: 400,
      }),
  );
  await expect(model.interpret("Hello")).rejects.toMatchObject({
    provider: "Grok",
    status: 400,
    schemaKeywords: expect.arrayContaining(["unsupported", "parameters"]),
  });
  await expect(
    new GrokModel(
      "test-secret",
      "grok-4.3",
      async () => new Response("upstream", { status: 503 }),
    ).interpret("Hello"),
  ).rejects.toMatchObject({ provider: "Grok", status: 503 });
});
it("uses Grok first and one configured backup when both keys exist", () => {
  vi.stubEnv("XAI_API_KEY", "test-grok");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("IGOR_MODEL_PROVIDER", "");
  vi.stubEnv("LLM_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  expect(runtimeModelProvider("qloo-live")).toBeInstanceOf(GrokModel);
  vi.stubEnv("GEMINI_API_KEY", "test-gemini");
  expect(runtimeModelProvider("qloo-live")).toBeInstanceOf(FallbackModel);
});
it("repairs an invalid decision once through SDK tool-result messages", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      completed({ intent: "wrong", reply: "Hello" }, "bad"),
    )
    .mockImplementationOnce(async () => completed());
  expect(
    await new GrokModel("test-secret", "grok-4.3", transport).interpret(
      "Hello",
    ),
  ).toMatchObject({ intent: "conversation", reply: "Hello" });
  expect(transport).toHaveBeenCalledTimes(2);
  const body = JSON.parse(String(transport.mock.calls[1][1]?.body));
  expect(body.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: "tool", tool_call_id: "bad" }),
    ]),
  );
});
it("does not multiply automatic retries on provider failures", async () => {
  const transport = vi.fn<typeof fetch>(
    async () => new Response("unavailable", { status: 503 }),
  );
  await expect(
    new GrokModel("test-secret", "grok-4.3", transport).interpret("Hello"),
  ).rejects.toMatchObject({ provider: "Grok", status: 503 });
  expect(transport).toHaveBeenCalledTimes(1);
});
