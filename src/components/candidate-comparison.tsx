"use client";

import { ArrowUpRight } from "lucide-react";
import type { Task, TaskAction } from "@/core/contracts";
import { PracticalEditor } from "./task-editors";

export function CandidateComparison({
  task,
  busy,
  onAction,
  onReplaceCatalogue,
}: {
  task: Task;
  busy: boolean;
  onAction: (action: TaskAction) => void;
  onReplaceCatalogue: () => void;
}) {
  function describeSelection(ids: string[]) {
    return (
      ids
        .map((id) => {
          const candidate = task.candidates.find(
            (candidate) => candidate.id === id,
          );

          return candidate
            ? `${candidate.name} (${candidate.eligibility})`
            : id;
        })
        .join(", ") || "Not run"
    );
  }

  return (
    <>
      <div className="section-title">
        <h2 className="small-serif">The choices, with context.</h2>
        <button
          className="text-button"
          disabled={busy}
          onClick={onReplaceCatalogue}
        >
          Replace catalogue <ArrowUpRight size={13} />
        </button>
      </div>
      <p className="muted helper">
        Eligibility is calculated from supplied costs, access and time.{" "}
        {task.mode === "qloo-live"
          ? "A missing fact means needs review, never an invented price or runtime."
          : "Every sample fact is illustrative."}
      </p>
      <div className="options-table">
        <table>
          <thead>
            <tr>
              <th>Option</th>
              <th>Group cost</th>
              <th>Time</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {task.candidates.map((candidate) => (
              <tr
                key={candidate.id}
                className={
                  task.brief.selected.includes(candidate.id)
                    ? "selected-row"
                    : ""
                }
              >
                <td>
                  <details>
                    <summary>
                      <span className="option-name">{candidate.name}</span>
                      <span className="micro muted">
                        {candidate.type}
                        {task.brief.selected.includes(candidate.id)
                          ? " · selected"
                          : ""}
                      </span>
                    </summary>
                    <p>{candidate.description}</p>
                    <p>{candidate.fitReason}</p>
                    {candidate.cultural && (
                      <p>
                        {[
                          ...new Set(
                            Object.values(candidate.cultural).map(
                              (x) => x.delivery,
                            ),
                          ),
                        ].join(" / ")}{" "}
                        · Qloo returned ID {candidate.providerId}
                      </p>
                    )}
                    <div className="individual-fit">
                      {task.brief.participants.map((participant) => (
                        <span key={participant.id}>
                          {participant.name}:{" "}
                          {candidate.cultural
                            ? candidate.cultural[participant.id]
                              ? `affinity ${candidate.cultural[participant.id].affinity ?? "not supplied"} · rank ${candidate.cultural[participant.id].rank} · ${candidate.cultural[participant.id].delivery}`
                              : "not returned / unknown"
                            : (candidate.fit[participant.id] ?? "Unknown")}
                          {candidate.cultural?.[participant.id]
                            ?.explanationEntities.length ? (
                            <small>
                              {" "}
                              Query contributors:{" "}
                              {candidate.cultural[
                                participant.id
                              ].explanationEntities
                                .map(
                                  (x) =>
                                    task.entities.find(
                                      (entity) =>
                                        entity.providerId === x.entity_id,
                                    )?.name ?? x.entity_id,
                                )
                                .join(", ")}
                            </small>
                          ) : null}
                        </span>
                      ))}
                    </div>
                    <p>
                      {[...candidate.violations, ...candidate.missing].join(
                        " · ",
                      ) || "Fits the supplied hard constraints."}
                    </p>
                    {task.mode === "qloo-live" && (
                      <PracticalEditor
                        candidate={candidate}
                        task={task}
                        busy={busy}
                        save={onAction}
                      />
                    )}
                  </details>
                </td>
                <td>
                  {candidate.cost.value === null
                    ? "Unknown"
                    : `$${candidate.cost.value}`}
                </td>
                <td>
                  {candidate.duration.value === null
                    ? "Unknown"
                    : `${candidate.duration.value}m`}
                </td>
                <td>
                  <span className={`decision ${candidate.eligibility}`}>
                    {candidate.freshness === "stale"
                      ? "Stale decision"
                      : candidate.eligibility === "needs-review"
                        ? "Needs review"
                        : candidate.eligibility === "ineligible"
                          ? "Excluded"
                          : "Eligible"}
                  </span>
                  {(candidate.violations[0] || candidate.missing[0]) && (
                    <small className="decision-reason">
                      {candidate.violations[0] || candidate.missing[0]}
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {task.mode === "qloo-live" && (
        <section className="evidence-details">
          <h3>Same-pool evaluation</h3>
          <p>
            Same profiles and candidate facts; the baseline receives no Qloo
            affinity, rank or explanation. A different answer is not a win.
          </p>
          <button
            className="secondary-button"
            disabled={busy || !task.candidates.length}
            onClick={() => onAction({ type: "baseline" })}
          >
            Compare with LLM-only
          </button>
          {task.evaluation && (
            <>
              <p>
                {task.evaluation.version === task.brief.version
                  ? task.evaluation.status
                  : "Stale comparison: brief changed"}{" "}
                · {task.evaluation.warnings.join(" ")}
              </p>
              <p>LLM-only: {describeSelection(task.evaluation.baseline)}</p>
              <p>
                With cultural evidence:{" "}
                {describeSelection(task.evaluation.assisted)}
              </p>
              <p>
                These are exploratory shortlists; programme selection still
                enforces deterministic hard constraints.
              </p>
            </>
          )}
        </section>
      )}
      {!task.candidates.length && (
        <p className="empty-note">
          No current candidates. Start discovery or restore normal fixture mode.
        </p>
      )}
    </>
  );
}
