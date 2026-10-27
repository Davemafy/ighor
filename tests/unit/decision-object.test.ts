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
