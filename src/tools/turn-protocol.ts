import { z } from "zod";
import { LiveDecisionSchema, type Task } from "../core/contracts";

/** One transport envelope for both providers; the engine owns the complete decision schema. */
export function turnTool() {
  return {
    type: "function",
    name: "update_brief",
    description:
      "Return one conversational decision as a JSON-encoded object in decision. Ask for missing information instead of inventing a plan.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        decision: {
          type: "string",
          description: JSON.stringify(
            z.toJSONSchema(LiveDecisionSchema, { io: "input" }),
          ),
        },
      },
      required: ["decision"],
    },
    strict: true,
  };
}

export function readTurnDecision(argumentsText: string, context?: Task) {
  const envelope = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(argumentsText));
  const payload =
    "decision" in envelope
      ? z
          .record(z.string(), z.unknown())
          .parse(
            typeof envelope.decision === "string"
              ? JSON.parse(envelope.decision)
              : envelope.decision,
          )
      : envelope;

  if (
    !["conversation", "clarification"].includes(String(payload.intent)) &&
    typeof payload.actions === "string"
  ) {
    payload.actions = JSON.parse(payload.actions);
  }

  for (const field of [
    "budget",
    "duration",
    "wording",
    "actions",
    "outcome",
    "targetType",
    "reply",
    "replyEvidenceIds",
  ]) {
    if (payload[field] === null) {
      delete payload[field];
    }
  }

  const decision = LiveDecisionSchema.parse(payload);

  if (
    context &&
    (decision.intent === "conversation" ||
      decision.intent === "clarification") &&
    decision.replyEvidenceIds.some(
      (id) => !context.evidence.some((evidence) => evidence.id === id),
    )
  ) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["replyEvidenceIds"],
        message: "Use only evidence IDs listed in this thread.",
      },
    ]);
  }

  return decision;
}
