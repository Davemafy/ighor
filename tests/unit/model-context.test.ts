import { expect, it } from "vitest";
import { modelContext } from "../../src/tools/model-context";
import { freshTask } from "../../src/data/fixtures";

it("retains earlier thread context beyond eight messages without owner data", () => {
  const task = freshTask("private-thread-marker", "private-owner-marker");
  task.messages = Array.from({ length: 24 }, (_, index) => ({
    role: "user" as const,
    text:
      index === 0 ? "The trip is for our anniversary" : `Discussion ${index}`,
    at: new Date().toISOString(),
  }));
  const context = modelContext(task, "Back to our trip");
  expect(context.thread.messages).toHaveLength(24);
  expect(context.thread.messages[0].text).toContain("anniversary");
  expect(context.thread.omittedMessages).toBe(0);
  expect(JSON.stringify(context)).not.toContain("private-owner-marker");
  expect(JSON.stringify(context)).not.toContain("private-thread-marker");
});

it("bounds long histories and retrieves relevant older messages with explicit omissions", () => {
  const task = freshTask("bounded", "owner");
  task.messages = Array.from({ length: 80 }, (_, index) => ({
    role: "user" as const,
    text:
      index === 0
        ? "The anniversary trip should avoid crowds"
        : `${index} ${"ordinary discussion ".repeat(300)}`,
    at: new Date().toISOString(),
  }));
  const context = modelContext(
    task,
    "What did I say about the anniversary trip?",
  );
  expect(context.thread.messages.some((message) => message.index === 0)).toBe(
    true,
  );
  expect(context.thread.messages.at(-1)?.index).toBe(79);
  expect(context.thread.omittedMessages).toBeGreaterThan(0);
  expect(
    new TextEncoder().encode(JSON.stringify(context.thread.messages)).length,
  ).toBeLessThan(65000);
});

it("keeps conversations isolated when switching between saved threads", () => {
  const first = freshTask("first", "owner");
  const second = freshTask("second", "owner");
  first.messages = [
    {
      role: "user",
      text: "The anniversary trip is a surprise",
      at: new Date().toISOString(),
    },
  ];
  second.messages = [
    {
      role: "user",
      text: "This is a separate work presentation",
      at: new Date().toISOString(),
    },
  ];
  expect(JSON.stringify(modelContext(first, "Continue"))).not.toContain(
    "work presentation",
  );
  expect(JSON.stringify(modelContext(second, "Continue"))).not.toContain(
    "anniversary",
  );
});
