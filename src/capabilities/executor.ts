import { z } from "zod";
import {
  resultSchema,
  type Capability,
  type CapabilityContext,
  type CapabilityResult,
} from "./contract";
import { safeSerialize } from "../tools/qloo";

/** Validate both directions. The capability never receives the caller's mutable input. */
export async function executeCapability<
  I extends z.ZodType,
  O extends z.ZodType,
>(
  capability: Capability<I, O>,
  raw: unknown,
  context: CapabilityContext,
): Promise<CapabilityResult<z.output<O>>> {
  const start = Date.now();
  const fail = (
    code: "invalid-input" | "invalid-output" | "execution-failed",
  ): CapabilityResult<z.output<O>> => ({
    capability: capability.id,
    status: "error",
    data: null,
    evidenceIds: [],
    warnings: [
      `Capability ${capability.id} rejected ${code === "invalid-input" ? "its input" : code === "invalid-output" ? "its output" : "the execution"}.`,
    ],
    dependencies: [],
    requestCount: 0,
    durationMs: Date.now() - start,
    retry: code === "execution-failed" ? "manual" : "never",
    error: { code, message: "No unsafe result was applied." },
  });
  const input = capability.input.safeParse(raw);

  if (!input.success) {
    return fail("invalid-input");
  }

  let value;

  try {
    value = await capability.execute(structuredClone(input.data), context);
  } catch {
    return fail("execution-failed");
  }

  const result = resultSchema(capability.output).safeParse({
    ...value,
    capability: capability.id,
    durationMs: Date.now() - start,
    error: null,
  });

  if (!result.success || !Object.hasOwn(value as object, "data")) {
    return fail("invalid-output");
  }

  const validated = result.data as CapabilityResult<z.output<O>>;

  if (
    ["ok", "partial", "ambiguous"].includes(validated.status) &&
    validated.data === null
  ) {
    return fail("invalid-output");
  }

  return {
    ...validated,
    warnings: JSON.parse(safeSerialize(validated.warnings)) as string[],
  };
}
