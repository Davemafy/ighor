import { describe, expect, it } from "vitest";
import {
  hasPendingInput,
  type TurnFeedback,
} from "../../src/components/turn-feedback";
const feedback: TurnFeedback = {
  input: "Make it quieter",
  action: { type: "message", text: "Make it quieter" },
  startedAt: Date.now(),
  messageCount: 1,
  state: "running",
  steps: [],
};
const previous = {
  role: "user" as const,
  text: "Make it quieter",
  at: "2026-01-01",
};
describe("Immediate message acknowledgement", () => {
  it("keeps a repeated message visible while a new turn is waiting", () => {
    expect(hasPendingInput([previous], feedback)).toBe(true);
  });
  it("removes the optimistic copy as soon as the server acknowledges it, regardless of server time", () => {
    expect(
      hasPendingInput([previous, { ...previous, at: "2020-01-01" }], feedback),
    ).toBe(false);
  });
  it("preserves an unacknowledged input after a transport failure", () => {
    expect(hasPendingInput([previous], { ...feedback, state: "error" })).toBe(
      true,
    );
  });
  it("does not invent messages for structured actions or completed turns", () => {
    expect(hasPendingInput([], { ...feedback, input: "" })).toBe(false);
    expect(hasPendingInput([], { ...feedback, state: "complete" })).toBe(false);
    expect(hasPendingInput([], null)).toBe(false);
  });
});
