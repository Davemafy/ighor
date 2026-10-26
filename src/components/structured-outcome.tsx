"use client";

import { useState } from "react";
import type { Artifact, Task, Turn } from "../core/contracts";
import type { OutcomeSpec } from "../core/outcome-spec";

export function OutcomeSettings({
  task,
  busy,
  send,
}: {
  task: Task;
  busy: boolean;
  send: (a: Omit<Extract<Turn, { type: "outcome" }>, "version">) => void;
}) {
  const spec = task.brief.outcome;
  const [days, setDays] = useState(
    spec?.kind === "itinerary" ? String(spec.days) : "1",
  );
  const [transfer, setTransfer] = useState(
    spec?.kind === "itinerary"
      ? spec.transferMinutes === null
        ? ""
        : String(spec.transferMinutes)
      : spec?.kind === "listening"
        ? String(spec.transitionMinutes)
        : "0",
  );

  if (!spec || !["itinerary", "listening"].includes(spec.kind)) {
    return null;
  }

  return (
    <details className="editable-source">
      <summary>
        Adjust the{" "}
        {spec.kind === "itinerary" ? "journey" : "listening programme"}
      </summary>
      <form
        className="outcome-settings"
        onSubmit={(e) => {
          e.preventDefault();
          const outcome: OutcomeSpec =
            spec.kind === "itinerary"
              ? {
                  kind: "itinerary",
                  days: Number(days),
                  transferMinutes: transfer === "" ? null : Number(transfer),
                }
              : { kind: "listening", transitionMinutes: Number(transfer) };
          send({ type: "outcome", outcome });
        }}
      >
        {spec.kind === "itinerary" && (
          <label>
            Days
            <input
              aria-label="Journey days"
              type="number"
              min="1"
              max="7"
              required
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
        )}
        <label>
          {spec.kind === "itinerary"
            ? "Transfer allowance per leg (minutes; blank means unknown)"
            : "Transition between artists (minutes)"}
          <input
            aria-label="Transition allowance"
            type="number"
            min="0"
            max={spec.kind === "itinerary" ? 240 : 30}
            required={spec.kind === "listening"}
            value={transfer}
            onChange={(e) => setTransfer(e.target.value)}
          />
        </label>
        <p className="micro muted">
          The brief&apos;s duration is the total activity time across all days.
          An allowance is your planning input, not a verified route.
        </p>
        <button className="button" disabled={busy}>
          Recalculate programme
        </button>
      </form>
    </details>
  );
}

export function StructuredOutcome({
  task,
  artifact,
  onEvidence,
}: {
  task: Task;
  artifact: Artifact;
  onEvidence: () => void;
}) {
  const details = artifact.details!;
  const name = (id: string) =>
    task.candidates.find((candidate) => candidate.id === id)?.name ?? id;

  return (
    <section aria-label="Structured outcome" className="structured-outcome">
      <p className="micro">
        {artifact.freshness === "stale"
          ? "STALE · Refresh before using"
          : details.status.replaceAll("-", " ")}
        . {details.totalMinutes} / {task.brief.constraints.duration} total
        minutes · ${details.totalCost} / ${task.brief.constraints.budget}.{" "}
        {details.days > 1
          ? `${details.days} days; equal time allowance per day.`
          : ""}
      </p>
      {Array.from({ length: details.days }, (_, i) => i + 1).map((day) => {
        const rows = details.segments.filter((segment) => segment.day === day);

        return rows.length ? (
          <section key={day} aria-label={`Day ${day}`}>
            <h3>
              {details.kind === "listening" ? "Listening order" : `Day ${day}`}
            </h3>
            <ol className="outcome-sequence">
              {rows.map((segment) => (
                <li key={segment.candidateId}>
                  <span className="micro">
                    Minute {segment.startMinute} · {segment.minutes} min{" "}
                    {segment.transferBefore
                      ? `· ${segment.transferBefore} min supplied transition`
                      : ""}
                  </span>
                  <h4>{name(segment.candidateId)}</h4>
                  <span className="micro muted">
                    Practical facts supplied; confirm access before committing.
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null;
      })}
      {!details.segments.length && (
        <p>
          No confirmed schedule. These are cultural references to investigate.
        </p>
      )}
      <h3>References & open decisions</h3>
      <ol className="outcome-references">
        {details.references.map((r) => (
          <li key={r.candidateId}>
            <strong>{name(r.candidateId)}</strong>
            <span className="micro">
              {" "}
              · {r.eligibility.replaceAll("-", " ")}
            </span>
            <p>
              {r.caveats.join(" · ") ||
                "Practical facts supplied, not externally verified."}
            </p>
          </li>
        ))}
      </ol>
      <h3>What still needs checking</h3>
      <ul>
        {details.openQuestions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <details>
        <summary>
          Inspect the claim ledger · {details.claims.length} claims
        </summary>
        {details.claims.map((c, i) => (
          <div key={i} className="outcome-claim">
            <span className="micro muted">{c.basis.replaceAll("-", " ")}</span>
            <p>{c.text}</p>
            <small>
              Evidence: {c.evidenceIds.join(", ") || "No factual assertion"}
            </small>
          </div>
        ))}
        <button onClick={onEvidence}>Open source records</button>
      </details>
    </section>
  );
}
