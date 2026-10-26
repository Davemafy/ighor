import { z } from "zod";
import { OutcomeDetailsSchema } from "./outcome-spec";
import { TaskSchema, type Task, Source } from "./contracts";
import { assertArtifactIntegrity } from "../capabilities/evaluate";

export const SnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  goal: z.string(),
  sourceVersion: z.number().int(),
  recordedAt: z.string(),
  artifacts: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      details: OutcomeDetailsSchema.optional(),
      title: z.string(),
      content: z.string(),
      freshness: z.enum(["current", "stale"]),
      edited: z.boolean(),
      assumptions: z.array(z.string()),
      evidenceIds: z.array(z.string()),
    }),
  ),
  options: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      eligibility: z.string(),
      missing: z.array(z.string()),
      violations: z.array(z.string()),
    }),
  ),
  evidence: z.array(
    z.object({
      id: z.string(),
      source: Source,
      at: z.string(),
      reference: z.string(),
      summary: z.string(),
      limitations: z.array(z.string()),
      freshness: z.enum(["current", "stale"]),
      delivery: z.enum(["LIVE", "CACHED"]).optional(),
    }),
  ),
  limitations: z.array(z.string()),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

/** Explicit public projection. No owner, messages, profiles, query bodies or execution traces. */
export function outcomeSnapshot(
  raw: Task,
  ids: string[],
  sharing = false,
): Snapshot {
  const task = TaskSchema.parse(raw);

  if (!ids.length || ids.length > 4 || new Set(ids).size !== ids.length) {
    throw new Error("Choose existing artifacts.");
  }

  const artifacts = ids.map((id) => {
    const artifact = task.artifacts.find((candidate) => candidate.id === id);

    if (!artifact) {
      throw new Error("Artifact not found.");
    }

    return artifact;
  });

  if (sharing && artifacts.some((a) => a.freshness !== "current")) {
    throw new Error("Refresh stale artifacts before sharing.");
  }

  if (artifacts.every((a) => a.freshness === "current")) {
    assertArtifactIntegrity(task);
  }

  const used = new Set(artifacts.flatMap((a) => a.evidenceIds));
  const result = {
    schemaVersion: 1 as const,
    goal: task.brief.goal,
    sourceVersion: task.brief.version,
    recordedAt: new Date().toISOString(),
    artifacts: artifacts.map((a) => ({
      id: a.id,
      kind: a.kind,
      details: a.details,
      title: a.title,
      content: a.content,
      freshness: a.freshness,
      edited: a.edited,
      assumptions: a.assumptions,
      evidenceIds: a.evidenceIds,
    })),
    options: task.candidates
      .filter(
        (candidate) =>
          task.brief.selected.includes(candidate.id) ||
          artifacts.some((a) =>
            a.details?.references.some((r) => r.candidateId === candidate.id),
          ),
      )
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        type: candidate.type,
        eligibility: candidate.eligibility,
        missing: candidate.missing,
        violations: candidate.violations,
      })),
    evidence: task.evidence
      .filter((evidence) => used.has(evidence.id))
      .map((evidence) => ({
        id: evidence.id,
        source: evidence.source,
        at: evidence.at,
        reference: evidence.reference,
        summary: evidence.summary,
        limitations: evidence.limitations,
        freshness: evidence.freshness,
        delivery: evidence.delivery,
      })),
    limitations: [
      "Snapshot, not a live booking or availability check.",
      "Edited prose is user-authored; evidence references do not verify newly written claims.",
      "Sharing includes the chosen text. Review it for private information before creating a link.",
    ],
  };
  let serialized = JSON.stringify(result);

  for (const value of [
    process.env.QLOO_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.LLM_API_KEY,
  ]) {
    if (value && value.length >= 8) {
      serialized = serialized.replaceAll(value, "[redacted]");
    }
  }

  serialized = serialized
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/(?:sk-|qloo_)[a-zA-Z0-9_-]{8,}/g, "[redacted]")
    .replace(/AIza[0-9A-Za-z_-]{25,}/g, "[redacted]");

  return SnapshotSchema.parse(JSON.parse(serialized));
}

export function exportMarkdown(snapshot: Snapshot) {
  const plain = (value: string) => value.replaceAll("\r", "");

  return (
    [
      "# Igor outcome",
      snapshot.goal,
      `Source version: ${snapshot.sourceVersion} · recorded ${snapshot.recordedAt}`,
      ...snapshot.artifacts.flatMap((a) => [
        `## ${plain(a.title)}`,
        `Status: ${a.freshness}${a.edited ? "; user edited" : ""}`,
        plain(a.content),
        "Assumptions:",
        ...a.assumptions.map((value) => `- ${plain(value)}`),
      ]),
      "## Evidence",
      ...snapshot.evidence.flatMap((e) => [
        `### ${e.id}`,
        `${e.source} · ${e.delivery ?? "supplied"} · ${e.at} · ${e.freshness}`,
        plain(e.summary),
        `Reference: ${plain(e.reference)}`,
        ...e.limitations.map((value) => `- ${plain(value)}`),
      ]),
      "## Limitations",
      ...snapshot.limitations.map((value) => `- ${value}`),
    ].join("\n\n") + "\n"
  );
}

export const OutputActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("update-collection"),
    version: z.number().int(),
    revision: z.number().int().positive(),
    id: z.string(),
    title: z.string().trim().min(1).max(100),
    notes: z.string().max(3000),
    order: z.array(z.string()).min(1).max(30),
  }),
  z.strictObject({
    type: z.literal("collection"),
    version: z.number().int(),
    title: z.string().trim().min(1).max(100),
    candidateIds: z.array(z.string()).min(1).max(30),
  }),
  z.strictObject({
    type: z.literal("delete-collection"),
    version: z.number().int(),
    id: z.string(),
  }),
  z.strictObject({
    type: z.literal("share"),
    version: z.number().int(),
    artifactIds: z.array(z.string()).min(1).max(4),
    participantId: z.string().nullable().default(null),
    expiresInDays: z.number().int().min(1).max(7).default(7),
  }),
  z.strictObject({
    type: z.literal("revoke"),
    version: z.number().int(),
    id: z.string(),
  }),
  z.strictObject({
    type: z.literal("accept-review"),
    version: z.number().int(),
    id: z.string(),
  }),
  z.strictObject({
    type: z.literal("blind-comparison"),
    version: z.number().int(),
  }),
  z.strictObject({
    type: z.literal("assessment"),
    version: z.number().int(),
    id: z.string(),
    choice: z.enum(["A", "B", "no-preference", "insufficient-evidence"]),
    reason: z.string().trim().min(1).max(1500),
  }),
]);

export const ReviewInputSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("comment"),
    text: z.string().trim().min(1).max(1500),
  }),
  z.strictObject({
    type: z.literal("preference"),
    value: z.string().trim().min(1).max(100),
    polarity: z.enum(["like", "dislike", "unknown", "not-now"]),
  }),
]);

export type ReviewInput = z.infer<typeof ReviewInputSchema>;

/** Compare the referenced records, not the enclosing task version. Wording-only
 * edits and memory changes must not invalidate an unchanged reference board. */
export function collectionSourceChanged(
  saved: { items: Task["candidates"]; evidence: Task["evidence"] },
  current: Task,
) {
  const signature = (candidate: Task["candidates"][number]) =>
    JSON.stringify({
      id: candidate.id,
      providerId: candidate.providerId,
      type: candidate.type,
      cost: candidate.cost,
      duration: candidate.duration,
      available: candidate.available,
      availabilitySource: candidate.availabilitySource,
      location: candidate.location,
      eligibility: candidate.eligibility,
      fit: Object.fromEntries(Object.entries(candidate.fit).sort()),
      cultural: Object.entries(candidate.cultural ?? {})
        .sort()
        .map(([id, s]) => ({
          id,
          rank: s.rank,
          affinity: s.affinity,
          queryId: s.queryId,
          seedIds: [...s.seedIds].sort(),
        })),
    });

  return (
    saved.items.some((candidate) => {
      const latest = current.candidates.find((x) => x.id === candidate.id);

      return (
        !latest ||
        latest.freshness !== "current" ||
        signature(latest) !== signature(candidate)
      );
    }) ||
    saved.evidence.some(
      (evidence) =>
        !current.evidence.some(
          (latest) =>
            latest.id === evidence.id &&
            latest.freshness === "current" &&
            latest.summary === evidence.summary &&
            latest.at === evidence.at,
        ),
    )
  );
}

export type OutputAction = import("./contracts").WithoutVersion<
  z.input<typeof OutputActionSchema>
>;
