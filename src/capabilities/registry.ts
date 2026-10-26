import { z } from "zod";
import {
  defineCapability,
  ok,
  CapabilityIdSchema,
  type CapabilityContext,
} from "./contract";
import { executeCapability } from "./executor";
import {
  ArtifactSchema,
  BriefSchema,
  CandidateInputSchema,
  CandidateSchema,
  EntitySchema,
  EntityType,
  EvidenceSchema,
  ParticipantSchema,
  ScheduleSchema,
  TaskSchema,
  ToolResultSchema,
  type CandidateInput,
} from "../core/contracts";
import { withToolDeadline } from "../core/execution";
import { candidateIdentity } from "../core/identity";
import {
  isEvidenceKind,
  replaceEvidence,
  requireCandidateEvidence,
  validateEvidence,
  requireEvidence,
} from "../core/evidence";
import { safeSerialize } from "../tools/qloo";
import { fitFor } from "./collaborate";
import { evaluateCandidates, assertArtifactIntegrity } from "./evaluate";
import { compose } from "./compose";

const goals = ["gathering", "discovery", "creative"] as const;

const catalogue = CandidateInputSchema.array().max(30);

const entities = EntitySchema.array();

const evidence = EvidenceSchema.array();

const candidates = CandidateSchema.array().max(30);

export const DiscoveryInputSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("resolve"),
    terms: z.array(z.string().min(1).max(100)).max(240),
    intendedTypes: z.record(z.string(), EntityType).optional(),
    entities,
  }),
  z.object({
    operation: z.literal("retrieve"),
    anchor: BriefSchema.shape.contextAnchor,
    targetTypes: z
      .array(z.enum(["movie", "tv_show", "artist", "place"]))
      .min(1)
      .max(3)
      .optional(),
    entities: entities.optional(),
    participants: ParticipantSchema.array().max(12),
    catalogue,
    location: z.string().min(1).max(100),
    version: z.number().int().nonnegative(),
    mode: TaskSchema.shape.simulation,
  }),
]);

export const DiscoveryOutputSchema = z.object({
  entities,
  options: catalogue,
  evidence,
  unresolved: z.array(z.string()),
});

const discover = defineCapability({
  id: "discover",
  goals,
  input: DiscoveryInputSchema,
  output: DiscoveryOutputSchema,
  async execute(input, ctx) {
    if (input.operation === "resolve") {
      const resolved = [...input.entities];
      let requests = 0;
      const warnings: string[] = [];

      for (const term of [...new Set(input.terms)]) {
        if (
          resolved.some(
            (entity) =>
              entity.original === term &&
              entity.status === "resolved" &&
              (!input.intendedTypes?.[term] ||
                entity.type === input.intendedTypes[term]),
          )
        ) {
          continue;
        }

        ctx.budget.take("resolve");
        const start = Date.now();
        const result = ToolResultSchema.parse(
          await withToolDeadline(
            ctx.cultural.resolve(term, input.intendedTypes?.[term]),
            ctx.cultural.timeoutMs ?? 5000,
          ),
        );
        requests += result.requestCount;
        warnings.push(...result.warnings);

        if (["blocked", "error", "empty"].includes(result.status)) {
          return {
            ...ok({
              entities: resolved,
              options: [],
              evidence: [],
              unresolved: [],
            }),
            status: result.status,
            warnings: result.warnings,
            requestCount: requests,
            retry: result.retry,
          };
        }

        const entity = EntitySchema.parse(result.data);

        if (entity.original !== term) {
          throw new Error("Entity does not match its input");
        }

        const index = resolved.findIndex((entity) => entity.original === term);

        if (index >= 0) {
          resolved[index] = entity;
        } else {
          resolved.push(entity);
        }

        ctx.trace(
          "cultural.resolve",
          `${term}: ${entity.status} identity.`,
          result.requestCount,
          [],
          Date.now() - start,
        );
      }

      const unresolved = resolved
        .filter(
          (entity) =>
            entity.status === "ambiguous" &&
            input.terms.includes(entity.original),
        )
        .map((entity) => `Which ${entity.original} do you mean?`);

      if (unresolved.length) {
        ctx.trace(
          "clarify",
          "Paused discovery until the ambiguous identity is resolved.",
        );
      }

      return {
        ...ok({ entities: resolved, options: [], evidence: [], unresolved }),
        status: unresolved.length ? "ambiguous" : "ok",
        warnings,
        requestCount: requests,
      };
    }

    ctx.budget.take("discover");
    const start = Date.now();
    const result = ToolResultSchema.parse(
      await withToolDeadline(
        ctx.cultural.discover(input),
        ctx.cultural.timeoutMs ?? 5000,
      ),
    );
    const warnings = JSON.parse(safeSerialize(result.warnings)) as string[];
    ctx.trace(
      "cultural.discover",
      warnings.join(" ") || "Cultural retrieval returned.",
      result.requestCount,
      result.evidenceIds,
      Date.now() - start,
    );

    if (result.status !== "ok" && result.status !== "partial") {
      return {
        ...ok({ entities: [], options: [], evidence: [], unresolved: [] }),
        status: result.status,
        warnings,
        requestCount: result.requestCount,
        retry: result.retry,
      };
    }

    const data = z.object({ options: catalogue, evidence }).parse(result.data);
    const records = validateEvidence(data.evidence).map((evidence) => ({
      ...evidence,
      kind: "cultural" as const,
      dependencies: [
        ...new Set([
          ...evidence.dependencies,
          "catalogue",
          // Artist-only cultural discovery does not read the venue.
          // Avoid invalidating a preserved soundtrack for a location edit.
          ...(input.targetTypes?.length === 1 &&
          input.targetTypes[0] === "artist" &&
          !input.anchor
            ? []
            : ["location"]),
          // The provider owns attribution. Preserve per-person dependencies when supplied.
          ...(input.anchor ||
          evidence.dependencies.some((value) =>
            value.startsWith("preferences:"),
          )
            ? []
            : input.participants.map(
                (participant) => `preferences:${participant.id}`,
              )),
        ]),
      ],
    }));

    if (
      new Set(data.options.map((candidate) => candidate.id)).size !==
      data.options.length
    ) {
      throw new Error("Duplicate candidate identity");
    }

    requireCandidateEvidence(data.options, records);
    requireEvidence(result.evidenceIds, records);

    return {
      ...ok(
        {
          entities: [],
          options: data.options,
          evidence: records,
          unresolved: [],
        },
        records.map((evidence) => evidence.id),
        records.flatMap((evidence) => evidence.dependencies),
      ),
      status: result.status,
      warnings,
      requestCount: result.requestCount,
    };
  },
});

export const EvaluationInputSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("eligibility"),
    options: catalogue,
    brief: BriefSchema,
    evidence,
    checkedOptions: catalogue,
    refreshFacts: z.boolean(),
  }),
  TaskSchema.pick({
    brief: true,
    candidates: true,
    evidence: true,
    artifacts: true,
    schedule: true,
  }).extend({ operation: z.literal("integrity") }),
]);

export const EvaluationOutputSchema = z.object({ candidates, evidence });

const evaluate = defineCapability({
  id: "evaluate",
  goals,
  input: EvaluationInputSchema,
  output: EvaluationOutputSchema,
  async execute(input, ctx) {
    ctx.budget.take("evaluate");

    if (input.operation === "integrity") {
      assertArtifactIntegrity(input);

      return ok(
        { candidates: input.candidates, evidence: input.evidence },
        input.artifacts.flatMap((a) => a.evidenceIds),
      );
    }

    validateEvidence(input.evidence);
    let checked: CandidateInput[] = input.checkedOptions;
    let records = input.evidence;

    if (input.refreshFacts) {
      ctx.budget.take("facts");
      const result = ToolResultSchema.parse(
        await withToolDeadline(
          ctx.facts.check(input.options, input.brief.constraints.location),
        ),
      );

      if (result.status !== "ok" && result.status !== "partial") {
        return {
          ...ok({ candidates: [], evidence: records }),
          status: result.status,
          warnings: result.warnings,
          retry: result.retry,
          requestCount: result.requestCount,
        };
      }

      checked = catalogue.parse(result.data);

      if (
        checked.length !== input.options.length ||
        checked.some(
          (candidate, i) =>
            candidate.id !== input.options[i].id ||
            candidateIdentity(candidate) !==
              candidateIdentity(input.options[i]),
        )
      ) {
        throw new Error("Practical facts changed candidate identity");
      }

      const facts = checked.map((candidate) => ({
        id: `facts:${candidate.id}:v${input.brief.version}`,
        kind: "practical" as const,
        source: candidate.sample
          ? ("illustrative-example" as const)
          : ("user-supplied" as const),
        at: ctx.now(),
        reference: candidate.cost.reference,
        entityIds: [candidateIdentity(candidate)],
        summary: `${candidate.name}: cost ${candidate.cost.value === null ? "unknown" : `$${candidate.cost.value}`}, duration ${candidate.duration.value ?? "unknown"}, access ${candidate.available === null ? "unknown" : candidate.available ? "supplied as available" : "unavailable"}.`,
        limitations: ["No external fact verification performed."],
        explanation: null,
        dependencies: ["catalogue", "location"],
        freshness: "current" as const,
      }));
      records = replaceEvidence(records, facts, "practical");
      ctx.trace(
        "facts.check",
        "Checked supplied practical facts.",
        result.requestCount,
        facts.map((evidence) => evidence.id),
      );
    } else {
      const practical = records.filter((evidence) =>
        isEvidenceKind(evidence, "practical"),
      );
      requireCandidateEvidence(input.options, practical);

      if (
        checked.length !== input.options.length ||
        checked.some(
          (candidate, i) =>
            candidate.id !== input.options[i].id ||
            candidateIdentity(candidate) !==
              candidateIdentity(input.options[i]),
        )
      ) {
        throw new Error("Practical cache does not match the catalogue");
      }
    }

    const output = evaluateCandidates(checked, {
      brief: input.brief,
      evidence: records,
    });
    ctx.trace(
      "evaluate.eligibility",
      `${output.filter((candidate) => candidate.eligibility === "eligible").length} eligible · ${output.filter((candidate) => candidate.eligibility === "ineligible").length} excluded · ${output.filter((candidate) => candidate.eligibility === "needs-review").length} need review.`,
    );

    return ok(
      { candidates: output, evidence: records },
      output.flatMap((candidate) => candidate.evidenceIds),
      ["budget", "duration", "location", "catalogue"],
    );
  },
});

export const CollaborationInputSchema = z.object({
  participants: ParticipantSchema.array().max(12),
  candidates,
});

export const CollaborationOutputSchema = z.object({
  candidates,
  disagreements: z.array(
    z.object({
      participantId: z.string(),
      candidateId: z.string(),
      score: z.number(),
    }),
  ),
});

const collaborate = defineCapability({
  id: "collaborate",
  goals,
  input: CollaborationInputSchema,
  output: CollaborationOutputSchema,
  async execute(input, ctx) {
    ctx.budget.take("collaborate");

    if (
      new Set(input.participants.map((participant) => participant.id)).size !==
        input.participants.length ||
      input.participants.some((participant) =>
        participant.preferences.some(
          (preference) => preference.subject !== participant.id,
        ),
      )
    ) {
      throw new Error("Invalid preference attribution");
    }

    if (
      input.candidates.some((candidate) => candidate.freshness !== "current")
    ) {
      throw new Error("Cannot compare stale candidates");
    }

    const output = input.candidates.map((candidate) => ({
      ...candidate,
      fit: fitFor(candidate, input.participants),
      fitReason:
        candidate.cultural &&
        Object.values(candidate.cultural).every(
          (association) => association.signalScope === "context",
        )
          ? "Qloo returned an entity-context association. Personal affinity remains unknown; no group preference has been inferred from this context query."
          : candidate.cultural
            ? "Qloo returned per-person ranks. Group compromise uses reciprocal rank and coverage, not raw scores across queries. Missing affinity is unknown, not dislike."
            : candidate.fitReason,
    }));
    const disagreements = output.flatMap((candidate) =>
      Object.entries(candidate.fit)
        .filter(([, score]) => score < 0)
        .map(([participantId, score]) => ({
          participantId,
          candidateId: candidate.id,
          score,
        })),
    );
    ctx.trace(
      "collaborate",
      output.every((candidate) => candidate.cultural)
        ? "Compared participants separately using per-query Qloo ranks and explicit dislikes. Missing affinity remains unknown; raw scores were not compared across queries."
        : "Compared participants separately. Qloo candidates use per-query ranks; fixture candidates use the disclosed tag-overlap heuristic.",
    );

    return ok(
      { candidates: output, disagreements },
      output.flatMap((candidate) => candidate.evidenceIds),
      input.participants.map((participant) => `preferences:${participant.id}`),
    );
  },
});

export const CompositionInputSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("create"),
    brief: BriefSchema,
    candidates,
    evidence,
    artifacts: ArtifactSchema.array(),
  }),
  z.object({
    operation: z.literal("edit"),
    artifact: ArtifactSchema,
    evidence,
    content: z.string().min(1).max(10000),
    wasCurrent: z.boolean(),
  }),
]);

export const CompositionOutputSchema = z.object({
  artifacts: ArtifactSchema.array(),
  selected: z.array(z.string()).nullable(),
  schedule: ScheduleSchema.array().nullable(),
  status: z.enum(["ready", "partial"]),
});

const composeCapability = defineCapability({
  id: "compose",
  goals,
  input: CompositionInputSchema,
  output: CompositionOutputSchema,
  async execute(input, ctx) {
    ctx.budget.take("compose");
    validateEvidence(input.evidence);

    if (input.operation === "edit") {
      const artifact = {
        ...input.artifact,
        content: input.content,
        version: input.artifact.version + 1,
        edited: true,
      };
      const current = new Set(
        input.evidence
          .filter((evidence) => evidence.freshness === "current")
          .map((evidence) => evidence.id),
      );
      artifact.freshness =
        input.wasCurrent && artifact.evidenceIds.every((id) => current.has(id))
          ? "current"
          : "stale";
      ctx.trace(
        "compose.edit",
        "Saved the draft edit. Cultural discovery was not called.",
      );

      return ok(
        {
          artifacts: [artifact],
          selected: null,
          schedule: null,
          status: artifact.freshness === "current" ? "ready" : "partial",
        },
        artifact.evidenceIds,
        artifact.dependencies,
      );
    }

    if (
      input.candidates.some((candidate) => candidate.freshness !== "current")
    ) {
      throw new Error("Cannot compose from stale decisions");
    }

    const output = compose(input);
    assertArtifactIntegrity({
      ...input,
      brief: { ...input.brief, selected: output.selected },
      artifacts: output.artifacts,
      schedule: output.schedule,
    });
    ctx.trace(
      "compose",
      `Updated ${output.artifacts.length} traceable, editable artifacts.`,
    );

    return {
      ...ok(
        output,
        output.artifacts.flatMap((a) => a.evidenceIds),
        output.artifacts.flatMap((a) => a.dependencies),
      ),
      status: output.status === "partial" ? "partial" : "ok",
    };
  },
});

/** Closed allowlist: untrusted goal text cannot register a function, URL or tool. */
export const capabilities = {
  discover,
  evaluate,
  collaborate,
  compose: composeCapability,
} as const;

export function getCapability(id: string) {
  const parsed = CapabilityIdSchema.safeParse(id);

  return parsed.success ? capabilities[parsed.data] : null;
}

export { executeCapability };

export type { CapabilityContext };
