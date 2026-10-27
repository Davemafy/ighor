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
  expect(
    readTurnDecision(raw, task, "A gift for someone").presentation,
  ).toBeUndefined();
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
