import { expect, it, vi } from "vitest";
import { FallbackModel } from "../../src/tools/fallback-model";
import { ProviderHttpError } from "../../src/core/interpretation-failure";
import { LiveDecisionSchema } from "../../src/core/contracts";
import { freshTask } from "../../src/data/fixtures";
import { completedTurnAfter } from "../../src/components/workspace-api";

const reply = LiveDecisionSchema.parse({
  intent: "conversation",
  reply: "Hello",
});
it("uses a single configured backup for a transient interpretation failure", async () => {
  const primary = {
    interpret: vi.fn(async () => {
      throw new ProviderHttpError("Gemini", 503, "");
    }),
    calls: 1,
    timeoutMs: 80,
  };
  const backup = {
    interpret: vi.fn(async () => reply),
    calls: 1,
    timeoutMs: 20,
  };
  const model = new FallbackModel(primary, backup);
  expect(await model.interpret("hey")).toEqual(reply);
  expect(backup.interpret).toHaveBeenCalledOnce();
  expect(model.calls).toBe(2);
  expect(model.timeoutMs).toBeGreaterThan(100);
});
it("records a credential failure and never calls a backup after primary success", async () => {
  const backup = { interpret: vi.fn(async () => reply) };
  const model = new FallbackModel(
    {
      interpret: async () => {
        throw new ProviderHttpError("Gemini", 401, "");
      },
    },
    backup,
  );
  expect(await model.interpret("hey")).toEqual(reply);
  expect(model.failures).toEqual([
    { provider: "Gemini", status: 401, category: null },
  ]);
  expect(backup.interpret).toHaveBeenCalledOnce();
  backup.interpret.mockClear();
  expect(
    await new FallbackModel({ interpret: async () => reply }, backup).interpret(
      "hey",
    ),
  ).toEqual(reply);
  expect(backup.interpret).not.toHaveBeenCalled();
});
it("does not keep retry available for an already completed saved turn", () => {
  const task = freshTask("reconnect", "owner");
  task.messages = [];
  task.brief.version = 2;
  task.status = "ready";
  expect(completedTurnAfter(task, 1, 0)).toBe(false);
  task.messages.push({
    role: "assistant",
    text: "Saved result",
    at: new Date().toISOString(),
  });
  expect(completedTurnAfter(task, 1, 0)).toBe(true);
  expect(completedTurnAfter(task, 2, 0)).toBe(false);
  task.status = "error";
  expect(completedTurnAfter(task, 1, 0)).toBe(false);
});

it("uses a separately configured backup for the observed Grok credential rejection", async () => {
  const primary = {
    interpret: vi.fn(async () => {
      throw new ProviderHttpError("Grok", 400, "Incorrect API key supplied");
    }),
  };
  const backup = { interpret: vi.fn(async () => reply) };
  const model = new FallbackModel(primary, backup);
  expect(await model.interpret("Hello")).toEqual(reply);
  expect(model.failures).toContainEqual({
    provider: "Grok",
    status: 400,
    category: "credentials",
  });
  expect(await model.interpret("Continue")).toEqual(reply);
  expect(primary.interpret).toHaveBeenCalledOnce();
  expect(backup.interpret).toHaveBeenCalledTimes(2);
});
