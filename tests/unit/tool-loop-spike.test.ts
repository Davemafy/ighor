import { expect, it, vi } from "vitest";
import { ToolLoopAgent, tool, isStepCount } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  createAgentToolRegistry,
  type AgentToolContext,
} from "../../src/core/agent-tool-registry";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";

it("SDK spike runs the existing guarded document tool and checkpoints its result", async () => {
  const task = freshTask("sdk-spike", "owner");
  const store = new SqliteTaskStore(":memory:");
  store.create(task);
  const ctx: AgentToolContext = {
    task,
    runId: "sdk-spike",
    sources: [],
    research: { research: vi.fn() },
  };
  const registry = createAgentToolRegistry(ctx);
  const definition = registry.find((t) => t.name === "document.create")!;
  const model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "one",
            toolName: "document_create",
            input: JSON.stringify({
              title: "Editable draft",
              content:
                "This is a persisted test draft, with no invented external claims.",
              sourceIds: [],
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      },
      {
        content: [
          {
            type: "text",
            text: "Draft saved; no cultural evidence was retrieved.",
          },
        ],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      },
    ],
  });

  try {
    const agent = new ToolLoopAgent({
      model,
      maxRetries: 0,
      stopWhen: isStepCount(2),
      tools: {
        document_create: tool({
          description: definition.description,
          inputSchema: definition.schema,
          execute: async (args) => {
            const result = await definition.execute(
              definition.schema.parse(args),
              ctx,
            );
            const expected = task.brief.version;
            task.brief.version++;
            store.save(task, expected, "owner");

            return result;
          },
        }),
      },
    });
    const result = await agent.generate({ prompt: "Save a test draft" });
    expect(result.steps).toHaveLength(2);
    expect(
      store
        .load(task.id, "owner")
        ?.artifacts.some((a) => a.title === "Editable draft"),
    ).toBe(true);
    expect(model.doGenerateCalls).toHaveLength(2);
  } finally {
    store.close();
  }
});
