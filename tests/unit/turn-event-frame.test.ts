import { expect, it } from "vitest";
import { turnEventFrame } from "../../src/core/turn-event-frame";

it("keeps legacy data-only framing and adds ordered IDs only when requested", () => {
  const event = { type: "action" as const, message: "Saved progress" };
  const legacy = turnEventFrame(event);
  expect(legacy.startsWith("data: ")).toBe(true);
  expect(JSON.parse(legacy.slice(6))).toEqual(event);
  expect(turnEventFrame(event, 42)).toBe(
    `id: 42\ndata: ${JSON.stringify(event)}\n\n`,
  );
});
