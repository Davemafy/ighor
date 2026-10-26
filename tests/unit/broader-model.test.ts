import { describe, it, expect, vi } from "vitest";
import { GeminiModel } from "../../src/tools/gemini-model";
import { freshLiveTask } from "../../src/data/live-task";
import type { OutcomeSpec } from "../../src/core/outcome-spec";

const response = (outcome: unknown, targetType = "place") =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          role: "model",
          parts: [
            {
              functionCall: {
                name: "update_brief",
                args: {
                  supported: true,
                  intent: "goal",
                  kind: "discovery",
                  goal: "An explicitly requested cultural outcome",
                  targetType,
                  outcome,
                  budget: null,
                  duration: null,
                  wording: null,
                },
              },
            },
          ],
        },
      },
    ],
  });

describe("Gemini boundary for typed broader outcomes (mock HTTP, not live execution)", () => {
  it.each<{ outcome: OutcomeSpec; target: string }>([
    {
      outcome: { kind: "itinerary", days: 3, transferMinutes: null },
      target: "place",
    },
    { outcome: { kind: "listening", transitionMinutes: 0 }, target: "artist" },
    { outcome: { kind: "research" }, target: "place" },
    { outcome: { kind: "music-direction" }, target: "artist" },
  ])(
    "transports and parses the $outcome.kind output contract without extra tools",
    async ({ outcome, target }) => {
      const transport = vi.fn<typeof fetch>(async () =>
        response(outcome, target),
      );
      const model = new GeminiModel(
        "synthetic-test-key",
        "gemini-3.5-flash-lite",
        transport,
      );
      const task = freshLiveTask("t", "o");
      task.brief.outcome = outcome;
      const actual = await model.interpret("User request", task);
      expect(actual.outcome).toEqual(outcome);
      expect(model.calls).toBe(1);
      const [url, init] = transport.mock.calls[0];
      expect(String(url)).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      );
      const body = JSON.parse(String(init?.body));
      expect(body.tools[0].functionDeclarations).toHaveLength(1);
      expect(body.tools[0].functionDeclarations[0].name).toBe("update_brief");
      expect(
        body.tools[0].functionDeclarations[0].parametersJsonSchema.properties
          .outcome,
      ).toBeDefined();
      expect(body.systemInstruction.parts[0].text).toContain('"outcome"');
    },
  );
  it.each([
    { kind: "itinerary", days: 30, transferMinutes: null },
    { kind: "research", url: "https://untrusted.test" },
    { kind: "listening", transitionMinutes: -5 },
  ])(
    "rejects invalid provider output without retry or action execution: %j",
    async (outcome) => {
      const transport = vi.fn<typeof fetch>(async () => response(outcome));
      const model = new GeminiModel(
        "synthetic-test-key",
        "gemini-3.5-flash-lite",
        transport,
      );
      await expect(
        model.interpret("User request", freshLiveTask("t", "o")),
      ).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
});
