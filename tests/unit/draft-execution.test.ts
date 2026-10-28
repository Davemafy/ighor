import { expect, it, vi } from "vitest";
import { runTurn } from "../../src/core/orchestrator";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import { ToolCallingModel } from "../../src/tools/tool-model";

it("creates and persists the requested first deliverable without Qloo or the large planner", async () => {
  const store = new SqliteTaskStore(":memory:");
  const task = freshTask("draft-turn", "owner");
  task.mode = "qloo-live";
  task.messages = [];
  const previousArtifacts = structuredClone(task.artifacts);
  store.create(task);
  const planner = vi.fn(async () => {
    throw new Error("Large interpreter should not be called");
  });
  const compose = vi.fn(async () => ({
    title: "Signal Runner — game concept",
    content:
      "# Signal Runner\n\nAn original puzzle game about routing signals.\n\n## Core loop\nPlace nodes, test the circuit, and beat the routing budget.\n\n## First playable\nBuild one board and three circuits.\n\n## Build plan\nImplement the board, then input, then tests. These are draft scope assumptions.",
  }));

  try {
    const result = await runTurn(
      store,
      task.id,
      "owner",
      {
        type: "message",
        text: "Help me make a game for gamers. Give me a first playable concept and build plan.",
        version: 0,
      },
      () => {},
      undefined,
      {
        routeConversation: async () => ({ intent: "draft" }),
        composeDraft: compose,
        interpret: planner,
      },
    );
    expect(result.status).toBe("ready");
    expect(result.canvas?.surface.nodes).toContainEqual(
      expect.objectContaining({
        type: "document",
        content: expect.stringContaining("Core loop"),
      }),
    );
    expect(result.artifacts).toEqual(previousArtifacts);
    expect(result.brief.participants).toEqual(task.brief.participants);
    expect(store.load(task.id, "owner").canvas).toEqual(result.canvas);
    expect(planner).not.toHaveBeenCalled();
    expect(compose).toHaveBeenCalledOnce();
  } finally {
    store.close();
  }
});
it("gives the router a typed draft path and reads a complete small-schema draft", async () => {
  const transport = vi.fn<typeof fetch>(async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    const name = body.tools[0].name;

    return Response.json({
      status: "completed",
      output: [
        {
          type: "function_call",
          name,
          call_id: "draft-call",
          arguments: JSON.stringify(
            name === "route_conversation"
              ? { intent: "draft" }
              : {
                  title: "New concept",
                  content:
                    "# New concept\n\nA concrete original concept, core loop and first implementation steps.",
                },
          ),
        },
      ],
    });
  });
  const model = new ToolCallingModel("test-secret", "test-model", transport);
  expect(await model.routeConversation("Create a game concept")).toEqual({
    intent: "draft",
  });
  expect(
    await model.composeDraft(
      "Create a game concept",
      freshTask("small-draft", "owner"),
    ),
  ).toMatchObject({ title: "New concept" });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(String(transport.mock.calls[1][1]?.body)).tools[0].parameters
      .properties,
  ).toHaveProperty("content");
});
