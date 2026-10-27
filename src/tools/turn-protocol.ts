import { z } from "zod";
import { validatePresentation } from "../core/presentation";
import { LiveDecisionSchema, type Task } from "../core/contracts";

/** One transport envelope for both providers; the engine owns the complete decision schema. */
export function turnTool() {
  return {
    type: "function",
    name: "update_brief",
    description:
      "Return the conversational decision as an object in decision, never a JSON-encoded string. Use only supported components and actions; ask only for details that block the requested work.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        decision: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              enum: [
                "conversation",
                "clarification",
                "goal",
                "revision",
                "unsupported",
              ],
            },
          },
          required: ["intent"],
          additionalProperties: true,
          description: JSON.stringify(
            z.toJSONSchema(LiveDecisionSchema, { io: "input" }),
          ),
        },
      },
      required: ["decision"],
    },
    // The application validates the discriminated decision, grounding and
    // permissions. An object envelope avoids double-encoding document text.
    strict: false,
  };
}

export function readTurnDecision(
  argumentsText: string,
  context?: Task,
  currentMessage?: string,
) {
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

  if (payload.presentation && context) {
    try {
      payload.presentation = validatePresentation(payload.presentation, {
        ...context,
        messages: [
          ...context.messages,
          ...(currentMessage ? [{ role: "user", text: currentMessage }] : []),
        ],
      });
    } catch {
      delete payload.presentation;
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
