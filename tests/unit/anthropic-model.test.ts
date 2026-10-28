import { afterEach, expect, it, vi } from "vitest";
import { AnthropicModel } from "../../src/tools/anthropic-model";
import { runtimeModelProvider } from "../../src/tools/runtime";

afterEach(() => vi.unstubAllEnvs());
it("executes validated Claude application tools directly with an Anthropic key", async () => {
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({
      id: "msg-test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: [
        {
          type: "tool_use",
          id: "tool-test",
          name: "update_brief",
          input: { decision: { intent: "conversation", reply: "Hello" } },
        },
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
  );
  const result = await new AnthropicModel(
    "test-claude-secret",
    "claude-sonnet-4-6",
    transport,
  ).interpret("Hello");
  expect(result).toMatchObject({ intent: "conversation", reply: "Hello" });
  expect(transport.mock.calls[0][0]).toBe(
    "https://api.anthropic.com/v1/messages",
  );
  const options = transport.mock.calls[0][1]!;
  expect(new Headers(options.headers).get("x-api-key")).toBe(
    "test-claude-secret",
  );
});
it("can run on only the existing Anthropic key", () => {
  for (const key of [
    "XAI_API_KEY",
    "GROK_API_KEY",
    "GEMINI_API_KEY",
    "LLM_API_KEY",
    "IGOR_MODEL_PROVIDER",
  ])
    {vi.stubEnv(key, "");}

  vi.stubEnv("ANTHROPIC_API_KEY", "test-claude");
  expect(runtimeModelProvider("qloo-live")).toBeInstanceOf(AnthropicModel);
});
