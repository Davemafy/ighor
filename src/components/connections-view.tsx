"use client";
import type { Task, TaskAction } from "@/core/contracts";
import { PlaceMap } from "./place-map";

export function Connections({
  task,
  onTurn,
}: {
  task: Task;
  onTurn?: (action: TaskAction) => Promise<void>;
}) {
  const candidates = task.candidates.filter((candidate) => candidate.cultural);
  const names = new Map(
    task.entities
      .filter((entity) => entity.providerId)
      .map((entity) => [entity.providerId!, entity.name]),
  );

  if (task.brief.contextAnchor) {
    names.set(
      task.brief.contextAnchor.providerId,
      task.brief.contextAnchor.name,
    );
  }

  return (
    <section className="connections-view">
      <p className="artifact-type">Cultural connections</p>
      <h2>From a taste to a new direction.</h2>
      {task.brief.contextAnchor && (
        <h3>Context: {task.brief.contextAnchor.name}</h3>
      )}
      <p className="helper">
        Seeds identify what was queried. A returned connection is an affinity
        signal, not a causal explanation or proof of personal relevance. Compare
        ranks within their query; raw scores across queries are not comparable.
      </p>
      {!candidates.length && (
        <p>
          No provider-returned connections yet. Supply a supported goal and
          resolve its cultural entities.
        </p>
      )}
      <PlaceMap
        task={task}
        onConnect={
          onTurn
            ? (id) =>
                void onTurn({
                  type: "connection",
                  candidateId: id,
                  targetType: "artist",
                })
            : undefined
        }
      />
      {candidates.map((candidate) => (
        <details className="connection-row" key={candidate.id}>
          <summary>
            <strong>{candidate.name}</strong>
            <span>
              {candidate.type} · {candidate.freshness}
            </span>
          </summary>
          {Object.entries(candidate.cultural ?? {}).map(([id, s]) => (
            <div className="connection-path" key={id}>
              <h3>
                {task.brief.participants.find(
                  (participant) => participant.id === id,
                )?.name ?? "A profile"}
              </h3>
              <p>
                {s.seedIds.map((id) => names.get(id) ?? id).join(" + ")} →{" "}
                {candidate.name}
              </p>
              <p>
                Rank {s.rank} · affinity {s.affinity ?? "not returned"} ·{" "}
                {s.delivery} · {new Date(s.retrievedAt).toLocaleString()}
              </p>
              <p className="micro">Query {s.queryId}</p>
              {s.explanationEntities.length ? (
                <>
                  <strong>
                    {s.explanationScope === "recommendation"
                      ? "Per-result explanation contributors"
                      : "Aggregate query contributors (not a per-result explanation)"}
                  </strong>
                  <ul>
                    {s.explanationEntities.map((contributor) => (
                      <li key={contributor.entity_id}>
                        {names.get(contributor.entity_id) ??
                          contributor.entity_id}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="micro">
                  No recognized per-result explanation field was returned. Query
                  seeds are not a substitute.
                </p>
              )}
            </div>
          ))}
        </details>
      ))}
    </section>
  );
}
