"use client";

import type { Task } from "@/core/contracts";
import { currentCulturalTraces } from "@/core/cultural-trace";

/**
 * Presents Qloo result attribution from stored data. No provider calls or
 * model-authored explanations: wording follows the actual signal scope.
 */
export function CulturalConnections({ task }: { task: Task }) {
  const traces = currentCulturalTraces(task);

  if (!traces.length) {
    return null;
  }

  return (
    <section className="evidence-records" aria-label="Qloo taste connections">
      <h3>Inside the taste connections</h3>
      <p className="helper muted">
        See which confirmed cultural inputs informed each result, and whether
        Qloo provided an explanation for that specific recommendation or the
        overall query. Each rank belongs to its own request.
      </p>
      {traces.slice(0, 10).map((trace) => (
        <details className="evidence-details" key={trace.candidateId}>
          <summary>
            {trace.name} · {trace.signals.length} cultural{" "}
            {trace.signals.length === 1 ? "signal" : "signals"}
          </summary>
          {trace.signals.map((signal, index) => (
            <div className="entity-line" key={index}>
              <strong>
                {signal.audience} · Qloo rank #{signal.rank}
              </strong>
              <span>
                {signal.seeds.length
                  ? "Confirmed inputs: " + signal.seeds.join(", ")
                  : "Confirmed cultural input references"}
              </span>
              <span>
                {signal.contributorScope === "recommendation"
                  ? signal.contributors.length
                    ? "Recommendation-level contributors: " +
                      signal.contributors.join(", ")
                    : "Qloo returned recommendation-level explanation data."
                  : signal.contributorScope === "aggregate-query"
                    ? "Query-wide contributors only — not a per-result explanation."
                    : "No provider contribution explanation was returned."}
              </span>
              <small>
                {signal.delivery} · {signal.retrievedAt}
                {signal.scope === "context"
                  ? " · Context association, not inferred personal taste"
                  : ""}
              </small>
            </div>
          ))}
        </details>
      ))}
      {traces.length > 10 && (
        <p className="helper muted">
          Showing ten current connections. Full source records appear below.
        </p>
      )}
    </section>
  );
}
