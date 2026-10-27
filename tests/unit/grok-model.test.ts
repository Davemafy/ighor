import { afterEach, expect, it, vi } from "vitest";
import { GrokModel } from "../../src/tools/grok-model";
import { runtimeModelProvider } from "../../src/tools/runtime";
import { FallbackModel } from "../../src/tools/fallback-model";

afterEach(() => vi.unstubAllEnvs());
const completed = () => Response.json({
  status: "completed",
  output: [{
    type: "function_call", name: "update_brief", call_id: "grok-call",
    arguments: JSON.stringify({ decision: { intent: "conversation", reply: "Hello" } }),
  }],
});
it("sends validated tools to xAI and disables response storage", async () => {
  const transport = vi.fn<typeof fetch>(async () => completed());
  const model = new GrokModel("test-grok-secret", "grok-4.3", transport);
  expect(await model.interpret("Hello")).toMatchObject({ intent: "conversation", reply: "Hello" });
  expect(transport.mock.calls[0][0]).toBe("https://api.x.ai/v1/responses");
  const options = transport.mock.calls[0][1] as RequestInit;
  expect(JSON.parse(String(options.body))).toMatchObject({ model: "grok-4.3", store: false, tool_choice: "required" });
});
it("labels xAI provider failures accurately", async () => {
  const model = new GrokModel("test-key", "grok-4.3", async () => new Response("unavailable", { status: 503 }));
  await expect(model.interpret("Hello")).rejects.toMatchObject({ provider: "Grok", status: 503 });
});
it("uses Grok without OpenAI and behind Gemini when both exist", () => {
  vi.stubEnv("XAI_API_KEY", "test-grok");
  vi.stubEnv("LLM_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  expect(runtimeModelProvider("qloo-live")).toBeInstanceOf(GrokModel);
  vi.stubEnv("GEMINI_API_KEY", "test-gemini");
  expect(runtimeModelProvider("qloo-live")).toBeInstanceOf(FallbackModel);
});
