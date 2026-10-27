import { z } from "zod";
import { validatePresentation } from "../core/presentation";
import { LiveDecisionSchema, type Task } from "../core/contracts";

/** Provider guidance uses simple JSON field types; Zod remains the execution authority. */
function providerShape(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const alternatives = (schema.anyOf ?? schema.oneOf) as
    Record<string, unknown>[] | undefined;

  if (alternatives) {
    const objects = alternatives.filter((branch) => branch.type === "object");

    if (objects.length) {
      const properties: Record<string, unknown> = {};

      for (const branch of objects) {
        for (const [key, value] of Object.entries(
          (branch.properties ?? {}) as Record<string, Record<string, unknown>>,
        )) {
          const next = providerShape(value);
          const previous = properties[key] as
            Record<string, unknown> | undefined;

          if (previous?.enum && next.enum) {
            next.enum = [
              ...new Set([
                ...(previous.enum as unknown[]),
                ...(next.enum as unknown[]),
              ]),
            ];
          }

          properties[key] = next;
        }
      }

      return { type: "object", properties, additionalProperties: true };
    }

    const types = [
      ...new Set(alternatives.map((branch) => branch.type).filter(Boolean)),
    ];
    const values = alternatives.flatMap(
      (branch) =>
        (branch.enum as unknown[]) ??
        (Object.hasOwn(branch, "const") ? [branch.const] : []),
    );

    return {
      ...(types.length ? { type: types.length === 1 ? types[0] : types } : {}),
      ...(values.length ? { enum: values } : {}),
    };
  }

  const result: Record<string, unknown> = {};

  for (const key of ["type", "description", "enum"]) {
    if (schema[key] !== undefined) {
      result[key] = schema[key];
    }
  }

  if (Object.hasOwn(schema, "const")) {
    result.enum = [schema.const];
  }

  if (schema.type === "object") {
    result.properties = Object.fromEntries(
      Object.entries(
        (schema.properties ?? {}) as Record<string, Record<string, unknown>>,
      ).map(([key, value]) => [key, providerShape(value)]),
    );
    result.additionalProperties = true;
  }

  if (schema.items) {
    result.items = providerShape(schema.items as Record<string, unknown>);
  }

  return result;
}

/** Native object envelope avoids double-encoding strings and works across both adapters. */
export function turnTool() {
  const schema = z.toJSONSchema(LiveDecisionSchema, { io: "input" });

  const guidance = providerShape(schema);

  return {
    type: "function",
    name: "update_brief",
    description:
      "Return one decision object, never a JSON-encoded string. Conversation/clarification requires reply. Goal/revision requires kind and goal. Use only supported components/actions.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        decision: {
          ...guidance,
          type: "object",
          properties: guidance.properties as Record<string, unknown>,
          required: ["intent"],
          description:
            'The complete application schema follows. Return an object with these fields including optional "presentation", not a JSON string: ' +
            JSON.stringify(schema),
        },
      },
      required: ["decision"],
    },
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
    } catch (error) {
      if (error instanceof z.ZodError) throw error;
      throw new z.ZodError([
        {
          code: "custom",
          path: ["presentation"],
          message:
            error instanceof Error ? error.message : "Invalid presentation",
        },
      ]);
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
