import { z } from "zod";
import { ToolStatus } from "../core/contracts";
import type { SupportedGoal } from "../core/goals";
import type {
  CulturalProvider,
  PracticalFactsProvider,
} from "../tools/interfaces";

export const CapabilityIdSchema = z.enum([
  "discover",
  "evaluate",
  "collaborate",
  "compose",
]);

export type CapabilityId = z.infer<typeof CapabilityIdSchema>;

export type Trace = (
  action: string,
  outcome: string,
  requests?: number,
  evidenceIds?: string[],
  durationMs?: number,
) => void;

export interface CapabilityContext {
  cultural: CulturalProvider;
  facts: PracticalFactsProvider;
  budget: { take(action: string): void };
  trace: Trace;
  now: () => string;
}

export const FailureSchema = z.object({
  code: z.enum([
    "invalid-input",
    "invalid-output",
    "execution-failed",
    "unsupported",
  ]),
  message: z.string(),
});

export function resultSchema<O extends z.ZodType>(output: O) {
  return z.object({
    capability: CapabilityIdSchema,
    status: ToolStatus,
    data: output.nullable(),
    evidenceIds: z.array(z.string()),
    warnings: z.array(z.string()),
    dependencies: z.array(z.string()),
    requestCount: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    retry: z.enum(["never", "manual"]),
    error: FailureSchema.nullable(),
  });
}

export type CapabilityResult<O> = {
  capability: CapabilityId;
  status: z.infer<typeof ToolStatus>;
  data: O | null;
  evidenceIds: string[];
  warnings: string[];
  dependencies: string[];
  requestCount: number;
  durationMs: number;
  retry: "never" | "manual";
  error: z.infer<typeof FailureSchema> | null;
};

export type CapabilityOutcome<O> = Omit<
  CapabilityResult<O>,
  "capability" | "durationMs" | "error"
>;

export interface Capability<I extends z.ZodType, O extends z.ZodType> {
  id: CapabilityId;
  goals: readonly SupportedGoal[];
  input: I;
  output: O;
  execute: (
    input: z.output<I>,
    context: CapabilityContext,
  ) => Promise<CapabilityOutcome<z.output<O>>>;
}

export function defineCapability<I extends z.ZodType, O extends z.ZodType>(
  definition: Capability<I, O>,
) {
  return definition;
}

export function ok<O>(
  data: O,
  evidenceIds: string[] = [],
  dependencies: string[] = [],
): CapabilityOutcome<O> {
  return {
    status: "ok",
    data,
    evidenceIds,
    dependencies,
    warnings: [],
    requestCount: 0,
    retry: "never",
  };
}
