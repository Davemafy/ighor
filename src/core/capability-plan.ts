import { z } from "zod";
import { SupportedGoalSchema, type SupportedGoal } from "./goals";
import { getCapability } from "../capabilities/registry";

export type CapabilityAction =
  | { capability: "discover"; operation: "resolve" | "retrieve" }
  | { capability: "evaluate"; operation: "eligibility" | "integrity" }
  | { capability: "collaborate"; operation: "compare" }
  | { capability: "compose"; operation: "create" | "edit" };

export const PlanInputSchema = z.object({
  goal: SupportedGoalSchema,
  mode: z.enum(["refresh", "edit", "memory"]),
  discover: z.boolean(),
  factsCurrent: z.boolean(),
  participantCount: z.number().int().min(0).max(12),
});

export function planCapabilities(raw: unknown):
  | {
      status: "ok";
      goal: SupportedGoal;
      actions: CapabilityAction[];
      refreshFacts: boolean;
    }
  | { status: "blocked"; actions: []; reason: string } {
  const parsed = PlanInputSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      status: "blocked",
      actions: [],
      reason:
        "Only gathering, cultural discovery and reference-based creative briefs are implemented.",
    };
  }

  const planInput = parsed.data;
  const actions: CapabilityAction[] = [];

  if (planInput.mode === "edit") {
    actions.push({ capability: "compose", operation: "edit" });
  } else if (planInput.mode === "refresh") {
    if (planInput.discover) {
      actions.push(
        { capability: "discover", operation: "resolve" },
        { capability: "discover", operation: "retrieve" },
      );
    }

    actions.push({ capability: "evaluate", operation: "eligibility" });

    if (planInput.participantCount) {
      actions.push({ capability: "collaborate", operation: "compare" });
    }

    actions.push(
      { capability: "compose", operation: "create" },
      { capability: "evaluate", operation: "integrity" },
    );
  }

  if (
    actions.some(
      (action) =>
        !getCapability(action.capability)?.goals.includes(planInput.goal),
    )
  ) {
    return {
      status: "blocked",
      actions: [],
      reason: "A selected capability does not support this goal.",
    };
  }

  return {
    status: "ok",
    goal: planInput.goal,
    actions,
    refreshFacts: !planInput.factsCurrent,
  };
}
