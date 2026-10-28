import { z } from "zod";
import {
  validatePresentation,
  PresentationNodeSchema,
  PresentationSchema,
} from "../core/presentation";
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
  const fields = guidance.properties as Record<string, Record<string, unknown>>;
  const presentation = fields.presentation;
  if (presentation?.properties) {
    presentation.required = ["id", "title", "basis", "root", "nodes"];
    const nodes = (
      presentation.properties as Record<string, Record<string, unknown>>
    ).nodes;
    const item = nodes.items as Record<string, unknown>;
    const shared = item.properties as Record<string, unknown>;
    // Variant-specific fields must follow the full contract in the description.
    // Merging all variants tells providers to fill unrelated fields on each node.
    item.properties = { id: shared.id, type: shared.type, title: shared.title };
    item.required = ["id", "type"];
  }

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

  if (payload.presentation && typeof payload.presentation === "object") {
    const surface = payload.presentation as Record<string, unknown>;
    // Presentation-only metadata normalization. Never normalize action payloads
    // or invent missing content, coordinates, prices, references or constraints.
    if (surface.title == null) surface.title = "Your work";
    if (Array.isArray(surface.nodes)) {
      surface.nodes = surface.nodes.map((raw: unknown) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
        const node = raw as Record<string, unknown>;
        const variant = PresentationNodeSchema.options.find(
          (option) => option.shape.type.safeParse(node.type).success,
        );
        if (!variant) return node;
        return Object.fromEntries(
          Object.entries(node).filter(([key]) =>
            Object.hasOwn(variant.shape, key),
          ),
        );
      });
    }
  }

  if (payload.presentation) {
    // Treat structure and context grounding as distinct boundaries. A broken
    // optional view may be dropped for a standalone *textual* answer, but a
    // wrong recipient, invented evidence or asserted completed UI must be
    // repaired instead of silently misrepresented.
    const structural = PresentationSchema.safeParse(payload.presentation);
    const reply = typeof payload.reply === "string" ? payload.reply : "";
    const claimsVisibleWork =
      /\b(?:created|prepared|displayed|shown|built|generated)\b|\bhere (?:is|are)\b/i.test(
        reply,
      );
    if (!structural.success) {
      if (
        (payload.intent === "conversation" ||
          payload.intent === "clarification") &&
        !claimsVisibleWork
      ) {
        delete payload.presentation;
      } else {
        throw structural.error;
      }
    } else if (context) {
      payload.presentation = validatePresentation(structural.data, {
        ...context,
        messages: [
          ...context.messages,
          ...(currentMessage ? [{ role: "user", text: currentMessage }] : []),
        ],
      });
    } else {
      payload.presentation = structural.data;
    }
  }

  const decision = LiveDecisionSchema.parse(payload);
  const visibleWork = Boolean(
    context &&
    (context.work?.documents.length ||
      context.work?.decisions.length ||
      context.artifacts.length ||
      context.candidates.length ||
      context.canvas?.surface.nodes.some(
        (node) =>
          !["question", "stack", "columns", "tabs", "activity"].includes(
            node.type,
          ),
      )),
  );
  if (
    (decision.intent === "conversation" ||
      decision.intent === "clarification") &&
    /\b(?:show|display|images?|posters?|document)\b/i.test(
      currentMessage || "",
    ) &&
    /\bhere (?:is|are)\b|\bI(?:'ve| have) (?:created|prepared|displayed|shown)\b/i.test(
      decision.reply,
    ) &&
    !decision.presentation &&
    !visibleWork
  ) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["presentation"],
        message:
          "The user asked to see work, but the claimed result has no visible content. Include the actual supported presentation, or use a discovery goal to retrieve real candidates and imagery. Do not claim an absent document or image was displayed.",
      },
    ]);
  }

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
