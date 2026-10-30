import {
  WorkspaceSnapshotSchema,
  type WorkspaceSnapshot,
} from "@/core/workspace-snapshot";

/**
 * A read-only presentation adapter. The server Task and WorkspaceSnapshot are
 * authoritative; this module must not produce new candidate identities, facts,
 * positions, personal tastes, revisions or synthetic success states.
 */
export type WorkspaceCandidate =
  | WorkspaceSnapshot["discovery"]["catalogue"][number]
  | WorkspaceSnapshot["discovery"]["candidates"][number];

export type WorkspaceEvidence = WorkspaceSnapshot["discovery"]["evidence"][number];

export type ScopedCulturalSignal = {
  key: string;
  participantId: string | null;
  participantName: string | null;
  scope: "participant" | "context" | "unknown";
  queryId: string;
  rankWithinQuery: number;
  rawAffinity: number | null;
  seedIds: readonly string[];
  explanationScope: "recommendation" | "aggregate-query" | "none" | "unknown";
  contributorIds: readonly string[];
  delivery: "LIVE" | "CACHED";
  retrievedAt: string;
};

export type GroundedMapPlace = {
  candidate: WorkspaceSnapshot["spatial"]["places"][number];
  latitude: number;
  longitude: number;
};

export type WorkspaceViewModel = {
  /** This is the original validated snapshot; always keep its revision. */
  snapshot: WorkspaceSnapshot;
  id: string;
  revision: number;
  candidates: readonly WorkspaceCandidate[];
  mapPlaces: readonly GroundedMapPlace[];
  evidenceById: ReadonlyMap<string, WorkspaceEvidence>;
  candidateById: ReadonlyMap<string, WorkspaceCandidate>;
  participants: WorkspaceSnapshot["participants"];
  selectedIds: readonly string[];
  selectedCandidates: readonly WorkspaceCandidate[];
  artifacts: WorkspaceSnapshot["artifacts"];
  conversation: WorkspaceSnapshot["conversation"];
  execution: WorkspaceSnapshot["execution"];
  /** Only exposes persisted source references for evaluated candidates. */
  evidenceForCandidate: (id: string) => readonly WorkspaceEvidence[];
  /** Raw Qloo signals are query scoped; no invented group score. */
  culturalSignalsForCandidate: (id: string) => readonly ScopedCulturalSignal[];
};

/**
 * A display model for *any* task, not an itinerary-specific view.
 * Validation happens on the boundary, including schema version checks.
 */
export function adaptWorkspaceSnapshot(input: unknown): WorkspaceViewModel {
  const snapshot = WorkspaceSnapshotSchema.parse(input);
  const byId = new Map<string, WorkspaceCandidate>();

  // Evaluated candidates overwrite raw catalogue records with the *same* ID.
  for (const item of snapshot.discovery.catalogue) byId.set(item.id, item);
  for (const item of snapshot.discovery.candidates) byId.set(item.id, item);

  const evidenceById = new Map<string, WorkspaceEvidence>();
  for (const item of snapshot.discovery.evidenceArchive)
    evidenceById.set(item.id, item);
  for (const item of snapshot.discovery.evidence)
    evidenceById.set(item.id, item);

  const participantById = new Map(
    snapshot.participants.map((person) => [person.id, person]),
  );
  const geocodedIds = new Set(snapshot.spatial.geocodedPlaceIds);
  const mapPlaces: GroundedMapPlace[] = [];

  for (const candidate of snapshot.spatial.places) {
    if (!geocodedIds.has(candidate.id) || candidate.sample) continue;
    if (candidate.type !== "place") continue;
    const latitude = candidate.place?.latitude;
    const longitude = candidate.place?.longitude;
    if (
      latitude == null ||
      longitude == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      continue;
    }
    mapPlaces.push({ candidate, latitude, longitude });
  }

  function evidenceForCandidate(id: string): readonly WorkspaceEvidence[] {
    const candidate = byId.get(id);
    if (!candidate || !("evidenceIds" in candidate)) return [];
    return candidate.evidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId))
      .filter((evidence): evidence is WorkspaceEvidence => evidence !== undefined);
  }

  function culturalSignalsForCandidate(
    id: string,
  ): readonly ScopedCulturalSignal[] {
    const candidate = byId.get(id);
    if (!candidate?.cultural) return [];

    return Object.entries(candidate.cultural).map(([key, signal]) => {
      const person = participantById.get(key);
      // Do not reclassify an aggregate/context query as a person's score.
      const isParticipant =
        !!person && signal.signalScope !== "context";
      return {
        key,
        participantId: isParticipant ? person.id : null,
        participantName: isParticipant ? person.name : null,
        scope: isParticipant
          ? ("participant" as const)
          : signal.signalScope === "context"
            ? ("context" as const)
            : ("unknown" as const),
        queryId: signal.queryId,
        rankWithinQuery: signal.rank,
        rawAffinity: signal.affinity,
        seedIds: signal.seedIds,
        explanationScope: signal.explanationScope ?? "unknown",
        contributorIds: signal.explanationEntities.map((item) => item.entity_id),
        delivery: signal.delivery,
        retrievedAt: signal.retrievedAt,
      };
    });
  }

  const candidates = [...byId.values()];
  return {
    snapshot,
    id: snapshot.id,
    revision: snapshot.revision,
    candidates,
    mapPlaces,
    evidenceById,
    candidateById: byId,
    participants: snapshot.participants,
    selectedIds: snapshot.plan.selectedCandidateIds,
    selectedCandidates: snapshot.plan.selectedCandidateIds
      .map((id) => byId.get(id))
      .filter((candidate): candidate is WorkspaceCandidate => !!candidate),
    artifacts: snapshot.artifacts,
    conversation: snapshot.conversation,
    execution: snapshot.execution,
    evidenceForCandidate,
    culturalSignalsForCandidate,
  };
}
