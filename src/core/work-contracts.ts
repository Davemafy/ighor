import { z } from "zod";

const Id = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,79}$/)
  .refine(
    (id) => !["main", "invitation"].includes(id),
    "Reserved legacy artifact identity",
  );
const Dependencies = z.array(z.string().min(1).max(160)).max(30);
const EvidenceIds = z.array(z.string().min(1).max(500)).max(30);
const Draft = {
  id: Id,
  title: z.string().trim().min(1).max(160),
  dependencies: Dependencies,
  evidenceIds: EvidenceIds,
};

/** Model-authored material is always a proposal. Confirmation is a separate action. */
export const WorkActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("goal"), id: Id, title: Draft.title }),
  z.strictObject({
    kind: z.literal("decision"),
    ...Draft,
    value: z.string().trim().min(1).max(3000),
    estimatedCost: z.number().min(0).max(1000000).nullable(),
    rationale: z.string().min(1).max(2000),
  }),
  z.strictObject({
    kind: z.literal("document"),
    ...Draft,
    content: z.string().trim().min(1).max(12000),
  }),
  z.strictObject({
    kind: z.literal("budget"),
    amount: z.number().min(0).max(1000000),
  }),
  z.strictObject({
    kind: z.literal("reduce-budget"),
    percent: z.number().min(0).max(100),
  }),
  z.strictObject({ kind: z.literal("approve"), id: Id }),
  z.strictObject({ kind: z.literal("reject"), id: Id }),
  z.strictObject({
    kind: z.literal("edit"),
    id: Id,
    content: z.string().trim().min(1).max(12000),
  }),
  z.strictObject({
    kind: z.literal("external"),
    connector: Id,
    action: z.string().min(1).max(500),
  }),
]);

const Revision = z.object({
  version: z.number().int().positive(),
  content: z.string(),
  at: z.string(),
  reason: z.string(),
});

export const WorkStateSchema = z.object({
  schemaVersion: z.literal(1),
  activeGoalId: Id.optional(),
  goals: z.array(z.object({ id: Id, title: Draft.title })).max(40),
  budget: z
    .object({
      amount: z.number().nonnegative(),
      confirmed: z.literal(true),
      currency: z.literal("USD"),
    })
    .optional(),
  budgetHistory: z
    .array(
      z.object({
        amount: z.number().nonnegative(),
        at: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
  decisions: z
    .array(
      z.object({
        ...Draft,
        goalId: Id,
        value: z.string(),
        rationale: z.string(),
        estimatedCost: z.number().nonnegative().nullable(),
        basis: z.literal("creative-proposal"),
        status: z.enum(["proposed", "approved", "rejected"]),
        conflict: z.string().nullable(),
        version: z.number().int().positive(),
        history: z.array(Revision).max(100),
      }),
    )
    .max(100),
  documents: z
    .array(
      z.object({
        ...Draft,
        goalId: Id,
        content: z.string(),
        basis: z.literal("creative-proposal"),
        edited: z.boolean(),
        status: z.enum(["proposed", "approved"]),
        freshness: z.enum(["current", "stale"]),
        conflict: z.string().nullable(),
        version: z.number().int().positive(),
        history: z.array(Revision).max(100),
      }),
    )
    .max(100),
  changes: z
    .array(
      z.object({
        at: z.string(),
        summary: z.string(),
        affectedIds: z.array(z.string()),
      }),
    )
    .max(100),
  externalActions: z
    .array(
      z.object({
        id: z.string(),
        connector: Id,
        action: z.string(),
        status: z.literal("blocked"),
        reason: z.string(),
        at: z.string(),
      }),
    )
    .max(40),
});

export type WorkAction = z.infer<typeof WorkActionSchema>;
export type WorkState = z.infer<typeof WorkStateSchema>;
export const emptyWork = (): WorkState => ({
  schemaVersion: 1,
  goals: [],
  budgetHistory: [],
  decisions: [],
  documents: [],
  changes: [],
  externalActions: [],
});
