import { expect, it } from "vitest";
import { z } from "zod";
import { interpretationFailure } from "../../src/core/interpretation-failure";

it("reports schema paths without returning rejected values or raw messages", () => {
  const result = z
    .object({ actions: z.array(z.object({ kind: z.literal("profile") })) })
    .safeParse({ actions: [{ kind: "private-secret" }] });

  if (result.success) {
    throw new Error("Expected schema failure");
  }

  const reason = interpretationFailure(result.error);
  expect(reason).toContain("actions.0.kind");
  expect(reason).not.toContain("private-secret");
  expect(interpretationFailure(new Error("private-secret"))).toBe(
    "unclassified provider response",
  );
});

it("distinguishes provider HTTP failure and invalid JSON", () => {
  expect(
    interpretationFailure(new Error("Gemini returned HTTP 400; no retry.")),
  ).toBe("provider HTTP 400");
  expect(interpretationFailure(new SyntaxError("private-secret"))).toBe(
    "invalid JSON",
  );
});
