import { expect, it, vi } from "vitest";
import { freshTask } from "../../src/data/fixtures";
import { unchangedTurn } from "../../src/core/apply-turn";
import { executeTaskPlan } from "../../src/core/execute-plan";
import type { CapabilityContext } from "../../src/capabilities/contract";

it("resolves an exploration anchor through Qloo without adding a personal taste", async () => {
  const task = freshTask("delegated", "owner");
  task.mode = "qloo-live";
  task.brief.kind = "discovery";
  task.brief.goal = "Find movies";
  task.brief.participants = [];
  task.catalogue = [];
  task.candidates = [];
  task.entities = [];
  task.messages = [
    { role: "user", text: "Use Qloo for movies", at: new Date().toISOString() },
    { role: "user", text: "Pick for me", at: new Date().toISOString() },
  ];
  const resolve = vi.fn(async () => ({
    status: "ok" as const,
    data: {
      id: "arrival",
      original: "Arrival",
      name: "Arrival",
      type: "movie" as const,
      providerId: "550e8400-e29b-41d4-a716-446655440000",
      status: "resolved" as const,
      metadata: "Qloo",
      choices: [],
    },
    evidenceIds: [],
    warnings: [],
    retry: "never" as const,
    requestCount: 1,
  }));
  const discover = vi.fn(async () => ({
    status: "empty" as const,
    data: { options: [], evidence: [] },
    evidenceIds: [],
    warnings: ["No results in test"],
    retry: "manual" as const,
    requestCount: 1,
  }));
  const context: CapabilityContext = {
    cultural: { resolve, discover },
    facts: { check: vi.fn() },
    budget: { take: vi.fn() },
    trace: vi.fn(),
    now: () => new Date().toISOString(),
  };
  const result = await executeTaskPlan(
    task,
    { ...unchangedTurn(task), needsDiscovery: true },
    context,
    false,
  );
  expect(resolve).toHaveBeenCalledWith("Arrival", "movie");
  expect(discover).toHaveBeenCalled();
  expect(result.brief.contextAnchor?.name).toBe("Arrival");
  expect(result.brief.participants).toEqual([]);
  expect(result.preferences).toEqual([]);
  expect(result.brief.assumptions.join(" ")).toContain(
    "not your stated preference",
  );
});
