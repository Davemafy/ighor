"use client";
import {
  Clock,
  Users,
  NotebookPen,
  ScanLine,
  RefreshCw,
  Check,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import type { Task, TaskAction } from "@/core/contracts";
import { StructuredOutcome, OutcomeSettings } from "./structured-outcome";
import { ArtifactEditor } from "./task-editors";

export function ProgrammeView({
  task,
  isBusy,
  onTurn,
  onEvidence,
}: {
  task: Task;
  isBusy: boolean;
  onTurn: (action: TaskAction) => void;
  onEvidence: () => void;
}) {
  const main = task.artifacts.find((artifact) => artifact.id === "main");
  const selectedCandidates = task.candidates.filter((candidate) =>
    task.brief.selected.includes(candidate.id),
  );
  const total = selectedCandidates.reduce(
    (sum, candidate) => sum + (candidate.cost.value ?? 0),
    0,
  );
  const minutes = task.schedule.reduce(
    (sum, segment) => sum + segment.minutes,
    0,
  );

  return (
    <>
      <div className="working-title">
        <span className="artifact-type">
          {main?.kind?.replace("-", " ") ?? "Working document"}
        </span>
        <span
          className={`freshness ${main?.freshness === "stale" ? "stale" : ""}`}
        >
          {main?.freshness === "stale" ? (
            <>
              <RefreshCw size={12} />
              Stale · awaiting revision
            </>
          ) : main ? (
            <>
              <Check size={12} />
              {main.edited
                ? "Current · user-authored"
                : task.mode === "qloo-live"
                  ? "Current · Qloo evidence"
                  : "Current · fixture-backed"}
            </>
          ) : isBusy ? (
            "Working…"
          ) : (
            "Needs your input"
          )}
        </span>
      </div>
      <h2 className="artifact-title">
        {main?.title ?? "Let’s resolve the important details."}
      </h2>
      {task.status === "clarification" && (
        <div className="notice">
          <AlertCircle size={17} />
          <div>
            {task.brief.unresolved.map((q) => (
              <p key={q}>{q}</p>
            ))}
            {task.entities
              .filter((event) => event.status === "ambiguous")
              .map((event) => (
                <div className="choice-buttons" key={event.id}>
                  {event.choices.map((candidate) => (
                    <button
                      disabled={isBusy}
                      key={candidate.id}
                      onClick={() =>
                        onTurn({
                          type: "resolve",
                          entityId: event.id,
                          choiceId: candidate.id,
                        })
                      }
                    >
                      {candidate.name}
                    </button>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}
      {main?.freshness === "stale" && (
        <div className="notice">
          <AlertCircle size={16} />
          <p>
            This output depends on facts that changed. It is retained for
            reference and must not be used as the current plan.
          </p>
        </div>
      )}
      {main?.details && (
        <OutcomeSettings
          key={`${task.id}:${task.brief.version}`}
          task={task}
          busy={isBusy}
          send={onTurn}
        />
      )}
      {main?.details && !main.edited ? (
        <StructuredOutcome
          task={task}
          artifact={main}
          onEvidence={onEvidence}
        />
      ) : task.brief.kind === "gathering" &&
        task.schedule.length > 0 &&
        !main?.edited ? (
        <>
          <div className="plan-intro">
            <p>
              {
                task.candidates.find(
                  (candidate) => candidate.id === task.brief.selected[0],
                )?.description
              }
            </p>
            <div className="plan-facts">
              <span>
                <Clock size={14} />
                {minutes} / {task.brief.constraints.duration} min
              </span>
              <span>
                ${total} / ${task.brief.constraints.budget}{" "}
                <small>sample group cost</small>
              </span>
            </div>
          </div>
          <div className="timeline">
            {task.schedule.map((segment, index) => (
              <div className="timeline-row" key={index}>
                <div className="timeline-index">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="timeline-body">
                  <span>
                    {segment.candidateId
                      ? task.candidates.find(
                          (candidate) => candidate.id === segment.candidateId,
                        )?.type === "movie"
                        ? "A shared story"
                        : "A change of frequency"
                      : index === 0
                        ? "Make room"
                        : "Leave room for conversation"}
                  </span>
                  <h3>{segment.label}</h3>
                  {segment.candidateId && (
                    <p>
                      {task.candidates
                        .find(
                          (candidate) => candidate.id === segment.candidateId,
                        )
                        ?.tags.join(" · ")}
                    </p>
                  )}
                </div>
                <div className="timeline-duration">
                  {segment.minutes}
                  <small>min</small>
                </div>
              </div>
            ))}
          </div>
          <section className="tradeoff">
            <h3>
              <Users size={17} /> A compromise, not a consensus.
            </h3>
            <p>
              {task.mode === "qloo-live"
                ? "Selection balances returned ranks and coverage. Missing evidence stays unknown. Raw affinities from different queries are not compared or treated as satisfaction probabilities."
                : "Selection balances average tag overlap with the least-matched profile. It is a disclosed development heuristic, not measured satisfaction."}
            </p>
            <div className="fit-people">
              {task.brief.participants.map((participant) => {
                const score = selectedCandidates.reduce(
                  (sum, candidate) =>
                    sum + (candidate.fit[participant.id] ?? 0),
                  0,
                );

                return (
                  <div key={participant.id}>
                    <span
                      className={`fit-dot ${score < 0 ? "conflict" : score === 0 ? "neutral" : ""}`}
                    />
                    <span>{participant.name}</span>
                    <small>
                      {task.mode === "qloo-live"
                        ? `${selectedCandidates.filter((candidate) => candidate.cultural?.[participant.id]).length}/${selectedCandidates.length} selected items have returned evidence`
                        : score < 0
                          ? "Discuss trade-off"
                          : score === 0
                            ? "Ask for feedback"
                            : "Illustrative tag overlap"}
                    </small>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        main && (
          <div className="prose">
            {main.edited && (
              <p className="micro muted">
                User-authored document · feasibility applies to the structured
                selection, not edits to this text.
              </p>
            )}
            {main.content}
          </div>
        )
      )}
      {main && !main.locked && (
        <details className="editable-source">
          <summary>
            <NotebookPen size={14} /> Edit the working document
          </summary>
          <ArtifactEditor
            key={`${main.id}:${main.version}`}
            artifact={main}
            disabled={isBusy}
            save={onTurn}
          />
          <p className="micro">
            Manual text is user-authored. Structured feasibility checks remain
            on the calculated selection.
          </p>
        </details>
      )}
      {main && (
        <button
          type="button"
          className="secondary-button"
          disabled={isBusy || (!main.locked && main.freshness !== "current")}
          onClick={() => onTurn({ type: "artifact-lock", artifactId: main.id, locked: !main.locked })}
        >
          {main.locked ? "Unlock approved direction" : "Approve and lock this direction"}
        </button>
      )}
      {task.artifacts.some((artifact) => artifact.id !== "main") && (
        <section className="connected-work" aria-label="Connected work">
          <h3>Connected work</h3>
          <p className="micro muted">Each output keeps its own approval and revision state. Stale locked work needs review.</p>
          {task.artifacts.filter((artifact) => artifact.id !== "main").map((artifact) => (
            <details className="connected-artifact" key={artifact.id}>
              <summary>
                <strong>{artifact.title}</strong>
                <span>{artifact.locked ? "Approved · locked" : artifact.freshness === "stale" ? "Needs review" : `Version ${artifact.version}`}</span>
              </summary>
              <div className="connected-artifact-body">
                <div className="prose">{artifact.content}</div>
                {artifact.freshness === "stale" && <p className="micro">Preserved for review, but dependent inputs changed. This is not a current recommendation.</p>}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isBusy || (!artifact.locked && artifact.freshness !== "current")}
                  onClick={() => onTurn({ type: "artifact-lock", artifactId: artifact.id, locked: !artifact.locked })}
                >
                  {artifact.locked ? "Unlock" : "Approve and lock"}
                </button>
                {!artifact.locked && (
                  <ArtifactEditor
                    key={`${artifact.id}:${artifact.version}`}
                    artifact={artifact}
                    disabled={isBusy}
                    save={onTurn}
                  />
                )}
              </div>
            </details>
          ))}
        </section>
      )}
      {main?.evidenceIds.length ? (
        <div className="evidence-footnote">
          <ScanLine size={15} />
          <span>
            {main.evidenceIds.length} linked source records ·
            {task.mode === "qloo-live"
              ? "Qloo evidence and supplied facts"
              : "illustrative catalogue"}
          </span>
          <button onClick={onEvidence}>
            Inspect evidence <ArrowUpRight size={13} />
          </button>
        </div>
      ) : null}
    </>
  );
}
