import { z } from "zod";
import { validatePresentation } from "../core/presentation";
import { LiveDecisionSchema, type Task } from "../core/contracts";

/** One transport envelope for both providers; the engine owns the complete decision schema. */
export function turnTool() {
  type Branch = { properties?: Record<string, unknown>; required?: string[] };
  const schema = z.toJSONSchema(LiveDecisionSchema, { io: "input" });
  const branches = (schema.anyOf ?? schema.oneOf ?? [schema]) as Branch[];
  const properties: Record<string, unknown> = Object.assign(
    {},
    ...branches.map((branch) => branch.properties ?? {}),
  );
  const intents = branches.flatMap(
    (branch) =>
      (branch.properties?.intent as { enum?: string[] } | undefined)?.enum ??
      [],
  );
  properties.intent = { type: "string", enum: [...new Set(intents)] };

  return {
    type: "function",
    name: "update_brief",
    description:
      "Return one decision object. Conversation or clarification needs a reply; goal or revision needs kind and goal. Include actual supported UI or work actions when creating work. Never JSON-encode the decision object as a string.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        decision: {
          type: "object",
          properties,
          required: ["intent"],
          anyOf: branches.map((branch) => ({
            properties: { intent: branch.properties?.intent },
            required: branch.required ?? [],
          })),
          additionalProperties: false,
          description:
            'A validated decision with optional "presentation" or workActions. Use conversation/clarification with reply, or goal/revision with kind, goal and grounded actions.',
        },
      },
      required: ["decision"],
    },
    // Conditional branches are validated by the provider schema and again by
    // the application's complete grounding/ownership checks before execution.
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
