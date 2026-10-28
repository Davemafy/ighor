import type { Task } from "./contracts";

export interface CulturalTraceSignal {
  audience: string;
  scope: "participant" | "context";
  rank: number;
  seeds: string[];
  contributorScope: "recommendation" | "aggregate-query" | "none";
  contributors: string[];
  delivery: "LIVE" | "CACHED";
  retrievedAt: string;
}

export interface CulturalTrace {
  candidateId: string;
  name: string;
  type: string;
  signals: CulturalTraceSignal[];
}

/**
 * Read-only Qloo attribution for result views.
 * Never turns query-wide explainability into a per-result reason, infers
 * interests for participants, or reinterprets cross-query affinity as odds.
 */
export function currentCulturalTraces(task: Task): CulturalTrace[] {
  // Evidence must come from the provider boundary, not a supplied or
  // illustrative record carrying a Qloo-shaped identifier.
  const currentEvidence = new Map(
    task.evidence
      .filter(
        (evidence) =>
          evidence.kind === "cultural" &&
          evidence.source === "provider-returned" &&
          evidence.freshness === "current" &&
          (evidence.delivery === "LIVE" || evidence.delivery === "CACHED"),
      )
      .map((evidence) => [evidence.id, evidence]),
  );
  const nameById = new Map(
    task.entities
      .filter((entity) => entity.status === "resolved" && entity.providerId)
      .map((entity) => [entity.providerId!, entity.name]),
  );
  if (task.brief.contextAnchor) {
    nameById.set(
      task.brief.contextAnchor.providerId,
      task.brief.contextAnchor.name,
    );
  }
  const participantNames = new Map(
    task.brief.participants.map((person) => [person.id, person.name]),
  );
  const stale = new Set(
    task.candidates
      .filter((candidate) => candidate.freshness === "stale")
      .map((candidate) => candidate.id),
  );

  return task.catalogue.flatMap((candidate) => {
    const identity = candidate.providerId ?? candidate.id;
    if (
      candidate.sample ||
      stale.has(candidate.id) ||
      !candidate.cultural
    ) {
      return [];
    }

    const signals: CulturalTraceSignal[] = Object.entries(candidate.cultural)
      .filter(([owner, association]) => {
        const evidence = currentEvidence.get(
          "qloo:" + association.queryId + ":" + owner + ":" + identity,
        );
        return (
          evidence?.entityIds.includes(identity) &&
          evidence.delivery === association.delivery
        );
      })
      .map(([owner, association]) => {
        const scope =
          association.signalScope === "context" ? "context" : "participant";
        const seeds = [...new Set(association.seedIds)]
          .map((id) => nameById.get(id))
          .filter((name): name is string => Boolean(name));
        const contributors = [
          ...new Set(
            association.explanationEntities
              .filter((item) => association.seedIds.includes(item.entity_id))
              .map((item) => nameById.get(item.entity_id))
              .filter((name): name is string => Boolean(name)),
          ),
        ];

        return {
          audience:
            scope === "context"
              ? "Cultural context"
              : participantNames.get(owner) ?? "Participant",
          scope,
          rank: association.rank,
          seeds,
          contributorScope: association.explanationScope ?? "none",
          contributors,
          delivery: association.delivery,
          retrievedAt: association.retrievedAt,
        };
      });

    return signals.length
      ? [
          {
            candidateId: candidate.id,
            name: candidate.name,
            type: candidate.type,
            signals,
          },
        ]
      : [];
  });
}
