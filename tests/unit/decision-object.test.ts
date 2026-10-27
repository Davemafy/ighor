import { freshTask } from "../../src/data/fixtures";
import { expect, it } from "vitest";
import { turnTool, readTurnDecision } from "../../src/tools/turn-protocol";
it("requests an object decision and validates document text without a second JSON decoding pass", () => {
  const tool = turnTool();
  expect(tool.parameters.properties.decision.type).toBe("object");
  const content =
    'A gift called "At home".\n\n- Cook together.\n- Budget: $50.\n- A literal backslash: \\';
  const raw = JSON.stringify({
    decision: {
      intent: "conversation",
      reply: "Here are three options.",
      presentation: {
        id: "gift",
        title: "Gift ideas",
        basis: "draft",
        root: "doc",
        nodes: [{ id: "doc", type: "document", content }],
      },
    },
  });
  const parsed = readTurnDecision(raw);
  expect(
    parsed.presentation?.nodes.find((node) => node.id === "doc"),
  ).toMatchObject({ content });
});
it("still accepts saved legacy string envelopes and rejects unsupported actions", () => {
  expect(
    readTurnDecision(
      JSON.stringify({
        decision: JSON.stringify({ intent: "conversation", reply: "Hello" }),
      }),
    ).intent,
  ).toBe("conversation");
  expect(() =>
    readTurnDecision(
      JSON.stringify({
        decision: {
          intent: "goal",
          kind: "creative",
          goal: "Send",
          actions: [{ kind: "execute", command: "send" }],
        },
      }),
    ),
  ).toThrow();
});

it("grounds a recipient mentioned in the current message before the thread is saved", () => {
  const task = freshTask("current-recipient", "owner");
  task.messages = [];
  task.brief.participants = [];
  const raw = JSON.stringify({
    decision: {
      intent: "clarification",
      reply: "What does Mum like?",
      presentation: {
        id: "recipient",
        title: "Gift",
        basis: "draft",
        root: "question",
        nodes: [
          {
            id: "question",
            type: "question",
            subject: "Mum",
            prompt: "What does Mum like?",
            fields: [{ id: "interest", label: "Interests", type: "text" }],
          },
        ],
      },
    },
  });
  expect(
    readTurnDecision(raw, task, "A gift for my mum").presentation?.nodes[0],
  ).toMatchObject({ subject: "Mum" });
  expect(() => readTurnDecision(raw, task, "A gift for someone")).toThrow(
    "Question subject must be supplied",
  );
});

it("exposes actual decision fields and both conversation/action intent alternatives to providers", () => {
  const schema = turnTool().parameters.properties.decision;

  for (const field of [
    "intent",
    "reply",
    "kind",
    "goal",
    "actions",
    "workActions",
    "presentation",
  ]) {
    expect(Object.hasOwn(schema.properties, field)).toBe(true);
  }

  expect(schema.properties.intent).toMatchObject({
    enum: expect.arrayContaining([
      "conversation",
      "clarification",
      "goal",
      "revision",
    ]),
  });
  expect(schema.required).toContain("intent");
  expect(schema.properties.reply).toMatchObject({ type: "string" });
  expect(schema.properties.goal).toMatchObject({ type: "string" });
});

it("keeps provider schemas to simple supported field types while the application rejects invalid decisions", () => {
  const properties = turnTool().parameters.properties.decision.properties;
  const keys: string[] = [];

  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        keys.push(key);

        if (key !== "description") {
          walk(child);
        }
      }
    }
  };

  walk(properties);

  for (const unsupported of [
    "const",
    "pattern",
    "anyOf",
    "oneOf",
    "$ref",
    "$schema",
  ]) {
    expect(keys).not.toContain(unsupported);
  }

  expect(() =>
    readTurnDecision(JSON.stringify({ decision: { intent: "goal" } })),
  ).toThrow();
});

it("rejects invalid compositions for provider repair instead of claiming invisible work", () => {
  const task = freshTask("invalid-layout", "owner");
  expect(() =>
    readTurnDecision(
      JSON.stringify({
        decision: {
          intent: "conversation",
          reply: "Created your table",
          presentation: {
            id: "options",
            title: "Options",
            basis: "draft",
            root: "table",
            nodes: [
              {
                id: "table",
                type: "table",
                columns: ["Option"],
                rows: [{ id: "one", cells: [{ text: "invalid cell" }] }],
              },
            ],
          },
        },
      }),
      task,
    ),
  ).toThrow();
});

it("accepts supplied gift results with missing display title and unrelated node fields without weakening content validation", () => {
  const task = freshTask("gift-format", "owner");
  const result = readTurnDecision(
    JSON.stringify({
      decision: {
        intent: "conversation",
        reply: "Here are your ideas",
        presentation: {
          id: "gifts",
          basis: "draft",
          root: "gift",
          nodes: [
            {
              id: "gift",
              type: "document",
              content:
                "Three gift ideas for Mum within the supplied $50 budget.",
              children: [],
              columns: [],
            },
          ],
        },
      },
    }),
    task,
  );
  expect(result.presentation?.title).toBe("Your work");
  expect(result.presentation?.nodes[0]).toMatchObject({
    type: "document",
    content: "Three gift ideas for Mum within the supplied $50 budget.",
  });
  expect(result.presentation?.nodes[0]).not.toHaveProperty("columns");
});

it("repairs an empty show-result claim while accepting an actual document", () => {
  const task = freshTask("show-result", "owner");
  task.canvas = undefined;
  task.candidates = [];
  task.artifacts = [];
  task.work = undefined;
  const decision = {
    intent: "conversation",
    reply: "Here is your movie discovery plan.",
  };
  expect(() =>
    readTurnDecision(JSON.stringify({ decision }), task, "show"),
  ).toThrow("no visible content");
  expect(
    readTurnDecision(
      JSON.stringify({
        decision: {
          ...decision,
          presentation: {
            id: "plan",
            title: "Plan",
            basis: "draft",
            root: "doc",
            nodes: [
              { id: "doc", type: "document", content: "The actual draft." },
            ],
          },
        },
      }),
      task,
      "show",
    ).presentation?.nodes[0].type,
  ).toBe("document");
});
