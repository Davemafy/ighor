"use client";

import type { Task, TaskAction } from "@/core/contracts";
import { CulturalConnections } from "./cultural-connections";

export function EvidenceView({
  task,
  busy,
  onAction,
}: {
  task: Task;
  busy: boolean;
  onAction: (a: TaskAction) => void;
}) {
  return (
    <>
      <h2 className="small-serif">What this result rests on.</h2>
      <p className="helper muted">
        {task.mode === "qloo-live"
          ? "Cultural evidence preserves Qloo source and delivery metadata. Web research is separately labelled, with source links and retrieval times; snippets are not verified page contents."
          : "Every cultural association in this test mode is synthetic. Reasoning is application-generated; there is no Qloo explanation payload."}
      </p>
      <div className="evidence-summary">
        <span>
          {
            task.evidence.filter((evidence) => evidence.freshness === "current")
              .length
          }
          <small>current records</small>
        </span>
        <span>
          {
            task.entities.filter((entity) => entity.status === "resolved")
              .length
          }
          <small>
            {task.mode === "qloo-live"
              ? "resolved identities"
              : "fixture identities"}
          </small>
        </span>
        <span>
          {task.trace.reduce((total, t) => total + t.requests, 0)}
          <small>external requests</small>
        </span>
      </div>
      <details className="evidence-details">
        <summary>Resolved cultural inputs</summary>
        {task.entities.map((entity) => (
          <div className="entity-line" key={entity.id}>
            <strong>{entity.original}</strong>
            <span>
              {entity.status} · {entity.type}
            </span>
            <small>
              {entity.metadata} · {entity.providerId ?? "no confirmed ID"}
            </small>
          </div>
        ))}
      </details>
      <CulturalConnections task={task} />
      <div className="evidence-records">
        {task.evidence.map((evidence) => (
          <details key={evidence.id} className="evidence-details">
            <summary>
              <span
                className={`source-label ${evidence.freshness === "stale" ? "stale" : ""}`}
              >
                {evidence.freshness === "stale"
                  ? "Stale"
                  : evidence.delivery
                    ? evidence.delivery
                    : evidence.source === "illustrative-example"
                      ? "Illustrative"
                      : evidence.source === "provider-returned"
                        ? evidence.kind === "practical"
                          ? "Web source"
                          : "Provider"
                        : evidence.source === "user-supplied"
                          ? "Supplied"
                          : evidence.source === "recorded-fixture"
                            ? "Recorded"
                            : "Unverified"}
              </span>
              {evidence.summary.split(":")[0]}
            </summary>
            <p>{evidence.summary}</p>
            <dl>
              <dt>Reference</dt>
              <dd>
                {evidence.kind === "practical" &&
                evidence.source === "provider-returned" &&
                evidence.reference.startsWith("https://") ? (
                  <a
                    href={evidence.reference}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open public source
                  </a>
                ) : (
                  evidence.reference
                )}
              </dd>
              <dt>Recorded</dt>
              <dd>{new Date(evidence.at).toLocaleString()}</dd>
              <dt>Provider explanation</dt>
              <dd>
                {evidence.explanation ??
                  "Not provided. Query metadata is not explainability."}
              </dd>
              <dt>Limitations</dt>
              <dd>{evidence.limitations.join(" ")}</dd>
              <dt>Dependencies</dt>
              <dd>{evidence.dependencies.join(", ")}</dd>
            </dl>
          </details>
        ))}
      </div>
      {task.mode === "illustrative-fixtures" && (
        <section className="failure-controls">
          <h3>Exercise recovery</h3>
          <p className="helper muted">
            These controls inject a failure into the actual fixture provider,
            then run the normal revision pipeline.
          </p>
          <label>
            Fixture provider behavior
            <select
              aria-label="Fixture provider behavior"
              value={task.simulation}
              disabled={busy}
              onChange={(e) =>
                onAction({
                  type: "simulation",
                  mode: e.target.value as Task["simulation"],
                })
              }
            >
              <option value="none">Normal fixture response</option>
              <option value="empty">Empty result</option>
              <option value="timeout">Timeout</option>
              <option value="auth">Authentication error</option>
              <option value="rate-limit">Rate limit</option>
              <option value="malformed">Malformed response</option>
            </select>
          </label>
        </section>
      )}
      <h3 className="trace-heading">Execution history</h3>
      <div className="trace-list">
        {[...task.trace].reverse().map((t) => (
          <div key={t.id} className="trace-item">
            <strong>{t.action}</strong>
            <p>{t.outcome}</p>
            <small>
              v{t.version} · {t.durationMs}ms · {t.requests} external requests
            </small>
          </div>
        ))}
      </div>
    </>
  );
}
