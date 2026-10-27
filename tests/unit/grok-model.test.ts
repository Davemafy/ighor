import { afterEach, expect, it, vi } from "vitest";
import { GrokModel } from "../../src/tools/grok-model";
import { runtimeModelProvider } from "../../src/tools/runtime";
import { FallbackModel } from "../../src/tools/fallback-model";

afterEach(() => vi.unstubAllEnvs());
const completed = () =>
  Response.json({
    object: "response",
    status: "completed",
    output: [
      {
        id: "fc-test",
        type: "function_call",
        name: "update_brief",
        call_id: "grok-call",
        arguments: JSON.stringify({
          decision: { intent: "conversation", reply: "Hello" },
        }),
      },
    ],
  });
it("sends validated tools to xAI and disables response storage", async () => {
  const transport = vi.fn<typeof fetch>(async () => completed());
  const model = new GrokModel("test-grok-secret", "grok-4.3", transport);
  expect(await model.interpret("Hello")).toMatchObject({
    intent: "conversation",
    reply: "Hello",
  });
  expect(transport.mock.calls[0][0]).toBe("https://api.x.ai/v1/responses");
  const options = transport.mock.calls[0][1] as RequestInit;
  expect(JSON.parse(String(options.body))).toMatchObject({
    model: "grok-4.3",
    store: false,
    tool_choice: "required",
  });
});
it("labels xAI provider failures accurately", async () => {
  const model = new GrokModel(
    "test-key",
    "grok-4.3",
    async () => new Response("unavailable", { status: 503 }),
  );
  await expect(model.interpret("Hello")).rejects.toMatchObject({
    provider: "Grok",
    status: 503,
  });
});
it("uses Grok without OpenAI and behind Gemini when both exist", () => {
  vi.stubEnv("XAI_API_KEY", "test-grok");
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
      Response.json({
        object: "response",
        status: "completed",
        output: [
          {
            id: "fc-bad",
            type: "function_call",
            name: "update_brief",
            call_id: "bad",
            arguments: JSON.stringify({
              decision: { intent: "wrong", reply: "Hello" },
            }),
          },
        ],
      }),
    )
    .mockImplementationOnce(async () => completed());
  expect(
    await new GrokModel("secret", "grok-4.3", transport).interpret("Hello"),
  ).toMatchObject({ intent: "conversation", reply: "Hello" });
  expect(transport).toHaveBeenCalledTimes(2);
  const body = JSON.parse(String(transport.mock.calls[1][1]?.body));
  expect(body.input).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "function_call_output", call_id: "bad" }),
    ]),
  );
});
it("does not multiply retries on transient provider failures", async () => {
  const transport = vi.fn<typeof fetch>(
    async () => new Response("unavailable", { status: 503 }),
  );
  await expect(
    new GrokModel("secret", "grok-4.3", transport).interpret("Hello"),
  ).rejects.toMatchObject({ provider: "Grok", status: 503 });
  expect(transport).toHaveBeenCalledTimes(1);
});
