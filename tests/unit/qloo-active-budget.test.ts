import { expect, it, vi } from "vitest";
import {
  LiveQlooProvider,
  MemoryResponseCache,
} from "../../src/tools/qloo-live";

it("retains the Qloo request allowance across slow model deliberation between tools", async () => {
  vi.useFakeTimers();
  const transport = vi.fn(async () => Response.json({ results: [] }));
  const provider = new LiveQlooProvider(
    "synthetic-key",
    new MemoryResponseCache(),
    transport,
    2,
  );

  try {
    await vi.advanceTimersByTimeAsync(80000); // Routing/requirements/model time, no Qloo I/O.
    expect(
      (await provider.request("/search", { query: "first" })).requests,
    ).toBe(1);
    await vi.advanceTimersByTimeAsync(80000); // More model reasoning after resolution.
    expect(
      (
        await provider.request("/v2/insights", {
          "filter.type": "urn:entity:artist",
        })
      ).requests,
    ).toBe(1);
    await expect(
      provider.request("/search", { query: "third" }),
    ).rejects.toThrow("cap reached");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(provider.calls).toBe(2);
    expect(
      (await provider.request("/search", { query: "first" })).delivery,
    ).toBe("CACHED");
    expect(transport).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it("preserves a discovery error at the registry boundary instead of reporting partial success", async () => {
  const { createAgentToolRegistry } =
    await import("../../src/core/agent-tool-registry");
  const { freshTask } = await import("../../src/data/fixtures");
  const task = freshTask("qloo-error", "owner");
  task.entities = [
    {
      id: "seed",
      original: "Sade",
      name: "Sade",
      type: "artist",
      providerId: "11111111-1111-4111-8111-111111111111",
      status: "resolved",
      metadata: "mock",
      choices: [],
    },
  ];
  const context = {
    task,
    runId: "test-run",
    sources: [],
    research: { research: vi.fn() },
    cultural: {
      resolve: vi.fn(),
      discover: vi.fn(async () => ({
        status: "error" as const,
        data: { options: [], evidence: [] },
        requestCount: 1,
        warnings: ["Qloo returned HTTP 429."],
        evidenceIds: [],
        retry: "manual" as const,
      })),
    },
  };
  const tool = createAgentToolRegistry(context).find(
    (t) => t.name === "qloo.discover",
  )!;
  const result = await tool.execute(
    { entityId: "seed", targetType: "artist" },
    context,
  );
  expect(result.status).toBe("error");
  expect(result.requests).toBe(1);
  expect(result.summary).toContain("HTTP 429");
  expect(task.evidence).toEqual([]);
});
