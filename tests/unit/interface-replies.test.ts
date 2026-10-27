import { expect, it } from "vitest";
import { interfaceReply } from "../../src/tools/interface-replies";
import { freshTask } from "../../src/data/fixtures";
import type { Task } from "../../src/core/contracts";

it("explains the UI boundary without generating a fake workspace", () => {
  const result = interfaceReply("I need fluid water like ui");
  expect(result?.intent).toBe("conversation");
  expect(result?.presentation).toBeUndefined();
  expect(result && "reply" in result ? result.reply : "").toContain(
    "only text",
  );
  expect(
    interfaceReply("Write a document about fluid interface design"),
  ).toBeUndefined();
});
it("shows only current retrieved images", () => {
  const task = freshTask("images", "owner");
  task.candidates = [
    {
      id: "film-one",
      freshness: "current",
      imageUrl: "https://example.test/poster.jpg",
    },
    {
      id: "old-film",
      freshness: "stale",
      imageUrl: "https://example.test/old.jpg",
    },
  ] as Task["candidates"];
  expect(
    interfaceReply("Their images", task)?.presentation?.nodes[0],
  ).toMatchObject({ type: "discovery", candidateIds: ["film-one"] });
});
it("does not invent posters for text suggestions or intercept discovery goals", () => {
  const result = interfaceReply("Their images", freshTask("none", "owner"));
  expect(result?.presentation).toBeUndefined();
  expect(interfaceReply("Find films based on Nujabes")).toBeUndefined();
});

it("continues delegated movie picks without inventing a personal preference", () => {
  const task = freshTask("pick", "owner");
  task.messages = [
    { role: "user", text: "Bring any movies", at: new Date().toISOString() },
  ];
  const result = interfaceReply("Well random pick for me", task);
  expect(result).toMatchObject({ intent: "goal", targetType: "movie" });
  expect(result?.actions).toBeUndefined();
  expect(
    interfaceReply("Pick for me", freshTask("unrelated", "owner")),
  ).toBeUndefined();
});
