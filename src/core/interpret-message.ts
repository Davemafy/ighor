import { interpretationFailure } from "./interpretation-failure";
import { assertGroundedOutcome, OutcomeGroundingError } from "./outcome-spec";
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
  const context = structuredClone(task);
  const initialRequestText = [
    input.text,
    ...context.messages
      .filter((message) => message.role === "user")
      .map((message) => message.text)
      .reverse(),
  ].join("\n");
  task.messages.push({ role: "user", text: input.text, at: at() });

  try {
    parsed = InterpretationSchema.parse(
      await withToolDeadline(
        model.interpret(input.text, context),
        model.timeoutMs ?? 5000,
      ),
    );

    if (parsed.intent === "conversation" || parsed.intent === "clarification") {
      for (const id of parsed.replyEvidenceIds) {
        if (!task.evidence.some((evidence) => evidence.id === id)) {
          throw new Error("Conversation cited unavailable evidence.");
        }
      }
    }

    if (parsed.outcome) {
      const explicitRevision =
        parsed.intent === "revision" &&
        task.brief.outcome?.kind === parsed.outcome.kind;
      assertGroundedOutcome(
        parsed.outcome,
        parsed.intent === "goal" && !context.brief.goal
          ? initialRequestText
          : input.text,
        explicitRevision ? task.brief.outcome : undefined,
      );
      const expectedTarget =
        parsed.outcome.kind === "itinerary"
          ? "place"
          : parsed.outcome.kind === "research"
            ? parsed.targetType
            : "artist";

      if (parsed.targetType === undefined) {
        parsed.targetType = expectedTarget;
      } else if (parsed.targetType !== expectedTarget) {
        throw new OutcomeGroundingError(
          "Should I put together a place-based itinerary or a cultural shortlist first?",
        );
      }
    }
  } catch (error) {
    if (error instanceof OutcomeGroundingError) {
      trace(
        "proposal.clarify",
        error.message,
        (model.calls ?? 0) - callsBefore,
      );
      task.messages.push({
        role: "assistant",
        kind: "conversation",
        text: error.question,
        at: at(),
      });

      return { ...update, task, conversationOnly: true };
    }

    task.status = "error";
    task.error =
      "I couldn’t complete that reply just now. Your conversation and saved work are still here. Please try again.";
    trace(
      "model.interpret.error",
      `${task.error} Diagnostic: ${interpretationFailure(error)}.`,
      (model.calls ?? 0) - callsBefore,
      [],
      Date.now() - interpretationStarted,
    );

    return { ...update, task, interpretationFailed: true };
  }

  trace(
    "model.interpret",
    parsed.intent === "conversation" || parsed.intent === "clarification"
      ? "Validated a conversational reply without planning edits."
      : "Validated supported goal or correction against the brief contract.",
    (model.calls ?? 0) - callsBefore,
    [],
    Date.now() - interpretationStarted,
  );

  if (parsed.intent === "conversation" || parsed.intent === "clarification") {
    task.messages.push({
      role: "assistant",
      kind: "conversation",
      text: parsed.reply,
      evidenceIds: parsed.replyEvidenceIds,
      at: at(),
    });

    return { ...update, task, conversationOnly: true };
  }

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
    parsed.intent === "revision" &&
    parsed.outcome &&
    !proposals.length
  ) {
    task.brief.outcome = parsed.outcome;
    changedDependencies.push("outcome");
  } else if (proposals.length) {
    const applied = applyConversationActions(
      task,
      proposals,
      parsed.intent === "goal" && !context.brief.goal
        ? initialRequestText
        : input.text,
    );

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

  // Keep explicitly supplied taste while asking for the locality needed to retrieve places.
  if (
    !clarification &&
    task.brief.targetType === "place" &&
    /^(?:at home|home screening room)$/i.test(task.brief.constraints.location)
  ) {
    clarification = "Which city or locality should Igor explore?";
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
