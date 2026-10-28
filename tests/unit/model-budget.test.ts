import { afterEach, expect, it, vi } from "vitest";
import { GrokModel } from "../../src/tools/grok-model";
import { AnthropicModel } from "../../src/tools/anthropic-model";
import { GeminiModel } from "../../src/tools/gemini-model";
import { FallbackModel } from "../../src/tools/fallback-model";
import {
  modelCallLimit,
  ModelRequestBudgetError,
} from "../../src/tools/model-budget";
import { interpretationFailure } from "../../src/core/interpretation-failure";

afterEach(() => vi.unstubAllEnvs());
const decision = { intent: "conversation", reply: "A considered response" };
const args = { decision };
const transports = {
  grok: () =>
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
                id: "call",
                type: "function",
                function: {
                  name: "update_brief",
                  arguments: JSON.stringify(args),
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  claude: () =>
    Response.json({
      id: "msg-test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: [
        { type: "tool_use", id: "call", name: "update_brief", input: args },
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  gemini: () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            role: "model",
            parts: [
              { functionCall: { name: "update_brief", args, id: "call" } },
            ],
          },
        },
      ],
    }),
};

for (const provider of ["grok", "claude", "gemini"] as const) {
  it(`${provider} supports the full bounded turn beyond six requests, then stops without I/O`, async () => {
    vi.stubEnv("IGOR_AGENT_MAX_STEPS", "8");
    const transport = vi.fn<typeof fetch>(async () => transports[provider]());
    const model =
      provider === "grok"
        ? new GrokModel("unit-private-credential", "grok-4.3", transport)
        : provider === "claude"
          ? new AnthropicModel(
              "unit-private-credential",
              "claude-sonnet-4-6",
              transport,
            )
          : new GeminiModel(
              "unit-private-credential",
              "gemini-3.5-flash-lite",
              transport,
            );

    for (let i = 0; i < modelCallLimit(); i++) {
      expect(await model.interpret("Consider this request")).toMatchObject(
        decision,
      );
    }

    expect(model.calls).toBe(14);
    await expect(
      model.interpret("Consider this request"),
    ).rejects.toBeInstanceOf(ModelRequestBudgetError);
    expect(transport).toHaveBeenCalledTimes(14);
  });
}

it("clamps step configuration and never buys backup requests after exhaustion", async () => {
  vi.stubEnv("IGOR_AGENT_MAX_STEPS", "1000");
  expect(modelCallLimit()).toBe(18);
  vi.stubEnv("IGOR_AGENT_MAX_STEPS", "NaN");
  expect(modelCallLimit()).toBe(14);
  const backup = { interpret: vi.fn() };
  const error = new ModelRequestBudgetError();
  await expect(
    new FallbackModel(
      {
        interpret: async () => {
          throw error;
        },
      },
      backup,
    ).interpret("Continue"),
  ).rejects.toBe(error);
  expect(backup.interpret).not.toHaveBeenCalled();
  expect(interpretationFailure(error)).toBe("model request_budget exhausted");
});

it("Gemini accepts the agent requirements tool before transport", async () => {
  const { freshTask } = await import("../../src/data/fixtures");
  const requirements = {
    culturalDecision: true,
    culturalReferences: ["Sade", "Radiohead", "Wong Kar-wai"],
    deliverables: ["proposal", "budget", "partner-pitch"],
  };
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "interpret_agent_requirements",
                  args: requirements,
                  id: "requirements",
                },
              },
            ],
          },
        },
      ],
    }),
  );
  const model = new GeminiModel(
    "unit-private-credential",
    "gemini-3.5-flash-lite",
    transport,
  );
  expect(
    await model.interpretAgentRequirements(
      "Build the Brooklyn proposal",
      freshTask("requirements", "owner"),
    ),
  ).toEqual(requirements);
  expect(transport).toHaveBeenCalledOnce();
});

it("retains an interpreted agent goal when the router omits a redundant query", async () => {
  const model = new GeminiModel(
    "unit-private-credential",
    "gemini-3.5-flash-lite",
    async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: "route_conversation",
                    args: { intent: "agent" },
                    id: "route",
                  },
                },
              ],
            },
          },
        ],
      }),
  );
  const goal = "Create a culturally grounded proposal within $3,000";
  expect(await model.routeConversation(goal)).toEqual({
    intent: "research",
    query: goal,
  });
});
