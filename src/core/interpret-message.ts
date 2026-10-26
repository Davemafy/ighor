import { assertGroundedOutcome } from "./outcome-spec";
import {
  TurnSchema,
  InterpretationSchema,
  type Task,
  type Turn,
} from "./contracts";
import type { z } from "zod";
import type { ModelProvider } from "../tools/interfaces";
import type { Trace } from "../capabilities/contract";
import { ExecutionBudget, withToolDeadline } from "./execution";
import { applyConversationActions } from "./conversation";
import {
  unchangedTurn,
  type ArtifactEdit,
  type TurnUpdate,
} from "./apply-turn";

export async function interpretMessage(
  task: Task,
  input: Extract<Turn, { type: "message" }>,
  model: ModelProvider,
  budget: ExecutionBudget,
  trace: Trace,
): Promise<TurnUpdate> {
  const update = unchangedTurn(task);
  const changedDependencies: string[] = [];
  let needsDiscovery = false;
  let localChangeOnly = false;
  let artifactEdit: ArtifactEdit | undefined;
  let clarification: string | null = null;
  const at = () => new Date().toISOString();

  budget.take("interpret");
  const interpretationStarted = Date.now();
  const callsBefore = model.calls ?? 0;
  let parsed: z.infer<typeof InterpretationSchema>;

  try {
    parsed = InterpretationSchema.parse(
      await withToolDeadline(
        model.interpret(input.text, structuredClone(task)),
        model.timeoutMs ?? 5000,
      ),
    );

    if (parsed.outcome) {
      const explicitRevision =
        parsed.intent === "revision" &&
        task.brief.outcome?.kind === parsed.outcome.kind;
      assertGroundedOutcome(
        parsed.outcome,
        input.text,
        explicitRevision ? task.brief.outcome : undefined,
      );
      const expectedTarget =
        parsed.outcome.kind === "itinerary"
          ? "place"
          : parsed.outcome.kind === "research"
            ? parsed.targetType
            : "artist";

      if (parsed.targetType !== expectedTarget) {
        throw new Error("Outcome and discovery domain disagree.");
      }
    }
  } catch {
    task.status = "error";
    task.error =
      "Interpretation failed safely. Your previous decisions were preserved; retry or use the structured brief.";
    trace(
      "model.interpret.error",
      task.error,
      (model.calls ?? 0) - callsBefore,
      [],
      Date.now() - interpretationStarted,
    );

    return { ...update, task, interpretationFailed: true };
  }

  trace(
    "model.interpret",
    "Validated supported goal or correction against the brief contract.",
    (model.calls ?? 0) - callsBefore,
    [],
    Date.now() - interpretationStarted,
  );
  // Validate extraction again; a future model cannot bypass the input contract.
  const patch = TurnSchema.parse({
    type: "constraints",
    budget: parsed.budget,
    duration: parsed.duration,
    version: input.version,
  });

  if (patch.type !== "constraints") {
    throw new Error("Invalid interpreted patch");
  }

  task.messages.push({ role: "user", text: input.text, at: at() });
  // All model-supplied numeric and wording patches use the same grounding rules,
  // including legacy top-level fields. Avoid duplicating equivalent artifact edits.
  const proposals = [...(parsed.actions ?? [])];

  if (parsed.budget !== undefined || parsed.duration !== undefined) {
    proposals.push({
      kind: "constraints",
      budget: parsed.budget,
      duration: parsed.duration,
    });
  }

  if (
    parsed.wording &&
    !proposals.some(
      (action) =>
        action.kind === "artifact" &&
        action.artifactId === "invitation" &&
        action.content === parsed.wording,
    )
  ) {
    proposals.push({
      kind: "artifact",
      artifactId: "invitation",
      content: parsed.wording,
    });
  }

  if (!parsed.supported) {
    clarification =
      "Choose a gathering, cultural discovery, a supplied-facts itinerary, an artist listening programme, music direction, cultural evidence report or reference-based creative brief. Other goals are not implemented.";
  } else if (
    parsed.outcome?.kind === "music-direction" &&
    /restaurant|dining/i.test(input.text) &&
    task.brief.contextAnchor?.type !== "place"
  ) {
    clarification =
      "Which resolved place should anchor the music direction? Discover places and choose a returned identity first. Igor will not invent dining-to-music evidence from an atmosphere description.";
  } else if (parsed.intent === "goal" && !parsed.goal.trim()) {
    clarification =
      "State the new goal, or describe this as a correction to the current task.";
  } else if (
    parsed.targetType === "place" &&
    !proposals.some(
      (action) => action.kind === "constraints" && action.location,
    ) &&
    /^(?:at home|home screening room)$/i.test(task.brief.constraints.location)
  ) {
    clarification =
      "Which city or locality should Igor explore? State Location: followed by its name.";
    task.brief.kind = "discovery";
    task.brief.outcome = parsed.outcome;
    task.brief.targetType = "place";
    task.brief.goal = parsed.goal || input.text;
    changedDependencies.push("goal");
  } else if (
    parsed.intent === "revision" &&
    parsed.outcome &&
    !proposals.length
  ) {
    task.brief.outcome = parsed.outcome;
    changedDependencies.push("outcome");
  } else if (proposals.length) {
    const applied = applyConversationActions(task, proposals, input.text);

    if (!applied.ok) {
      clarification = applied.question;
    } else {
      task = applied.task;
      changedDependencies.push(...applied.changed);
      needsDiscovery ||= applied.discover;

      if (parsed.intent === "goal") {
        const goalChanges = applyInterpretedGoal(task, parsed);
        changedDependencies.push(...goalChanges);
        needsDiscovery ||= goalChanges.includes("catalogue");
      }

      if (applied.artifact) {
        artifactEdit = {
          type: "artifact",
          ...applied.artifact,
          version: input.version,
        };
        localChangeOnly = true;
      }

      if (!task.candidates.length) {
        needsDiscovery = true;
      }
    }
  } else {
    if (
      parsed.intent === "goal" ||
      (parsed.intent === undefined &&
        (!task.brief.goal || !changedDependencies.length))
    ) {
      const goalChanges = applyInterpretedGoal(task, parsed);
      changedDependencies.push(...goalChanges);
      needsDiscovery ||= goalChanges.includes("catalogue");
    }

    if (task.candidates.length === 0) {
      needsDiscovery = true;
    }
  }

  return {
    ...update,
    task,
    changedDependencies,
    needsDiscovery,
    localChangeOnly,
    artifactEdit,
    clarification,
  };
}

function applyInterpretedGoal(
  task: Task,
  interpretation: z.infer<typeof InterpretationSchema>,
): string[] {
  const changedDependencies = ["outcome", "goal"];

  if (task.brief.targetType !== interpretation.targetType) {
    changedDependencies.unshift("catalogue");
  }

  task.brief.outcome = interpretation.outcome;
  task.brief.goal = interpretation.goal;
  task.brief.kind = interpretation.kind;
  task.brief.targetType = interpretation.targetType;
  const keepsAnchor =
    interpretation.outcome &&
    ["music-direction", "research"].includes(interpretation.outcome.kind);

  if (!keepsAnchor) {
    task.brief.contextAnchor = undefined;
  }

  return changedDependencies;
}
