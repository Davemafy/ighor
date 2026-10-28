import { describe, it, expect } from "vitest";
import { freshTask } from "../../src/data/fixtures";
import { verifyAgentOutcome } from "../../src/core/agent-acceptance";
import { SqliteTaskStore } from "../../src/data/store";
import { runUnifiedAgent } from "../../src/core/unified-agent";

describe("server outcome acceptance", () => {
  it("does not complete a requested pitch merely because the model finished after search", async () => {
    const store = new SqliteTaskStore(":memory:");
    const task = freshTask("pitch", "owner");
    store.create(task);

    try {
      await runUnifiedAgent({
        task,
        store,
        owner: "owner",
        goal: "Research and draft a partner pitch",
        trace() {},
        research: {
          research: async () => ({
            status: "ok",
            requests: 1,
            sources: [
              {
                id: "web-1",
                title: "Source",
                url: "https://example.org",
                snippet: "A source",
                retrievedAt: new Date().toISOString(),
              },
            ],
          }),
        },
        model: {
          interpret: async () => {
            throw Error("unused");
          },
          chooseAgentAction: async (_goal, _tools, observed) =>
            observed.length
              ? { name: "agent.finish", arguments: {} }
              : {
                  name: "web.search",
                  arguments: { query: "partner evidence" },
                },
        },
      });
      expect(task.agentRun?.status).toBe("partially_completed");
      expect(task.agentRun?.acceptance?.checks[0].status).toBe("unknown");
      expect(store.load(task.id, "owner").agentRun?.acceptance).toEqual(
        task.agentRun?.acceptance,
      );
      expect(verifyAgentOutcome(task, "Use Qloo", true).status).toBe("blocked");
    } finally {
      store.close();
    }
  });
});

it("revises a saved artifact without changing identity and refuses manually edited work", async () => {
  const { createAgentToolRegistry } =
    await import("../../src/core/agent-tool-registry");
  const task = freshTask("revision", "owner");
  task.artifacts.push({
    id: "agent-doc-previous-1",
    kind: "research-report",
    title: "Partner pitch",
    content: "Previously saved pitch that will be revised.",
    version: 1,
    dependencies: [],
    evidenceIds: [],
    assumptions: [],
    freshness: "current",
    edited: false,
  });
  const context = {
    task,
    research: {
      research: async () => ({
        status: "blocked" as const,
        requests: 0,
        sources: [],
      }),
    },
    sources: [],
    runId: "next",
  };
  const tool = createAgentToolRegistry(context).find(
    (t) => t.name === "document.revise",
  )!;
  const args = {
    artifactId: task.artifacts[0].id,
    title: "Partner pitch",
    content: "Revised cultural direction; the approved budget is unchanged.",
    sourceIds: [],
  };
  expect((await tool.execute(args, context)).status).toBe("ok");
  expect(task.artifacts).toHaveLength(1);
  expect(task.artifacts[0].id).toBe("agent-doc-previous-1");
  task.artifacts[0].edited = true;
  expect(
    (
      await tool.execute(
        { ...args, content: "Do not replace my edit with this text." },
        context,
      )
    ).status,
  ).toBe("blocked");
  expect(task.artifacts[0].content).toBe(args.content);
});
