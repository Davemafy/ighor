"use client";
import { useState } from "react";
import type { Task, TaskAction } from "@/core/contracts";
import { SavedCollections } from "./saved-collections";
import { ReviewSharing } from "./review-sharing";
import {
  useSavedOutcomes,
  type SaveOutput,
  type BlindComparison,
} from "./use-saved-outcomes";
export { Connections } from "./connections-view";

export function OutcomeWorkspace({
  task,
  onTask,
  onLoad,
  onTurn,
}: {
  task: Task;
  onTask: (task: Task) => void;
  onLoad: (id: string) => Promise<boolean>;
  onTurn: (saveOutput: TaskAction) => Promise<void>;
}) {
  const {
    data,
    errorMessage,
    statusMessage,
    setStatusMessage,
    isBusy,
    refresh,
    saveOutput,
    recallPreference,
  } = useSavedOutcomes(task, onTask, onTurn);

  return (
    <div className="outcome-workspace">
      <p className="artifact-type">Keep the useful work</p>
      <h2>A conversation you can build on.</h2>
      <p className="helper">
        Save references, carry approved tastes forward, export a document or
        invite someone to review. External actions stay explicit.
      </p>
      {errorMessage && (
        <p role="alert" className="outcome-error">
          {errorMessage}
        </p>
      )}
      {statusMessage && <p role="status">{statusMessage}</p>}
      <OutcomeExport task={task} />
      <SavedCollections
        task={task}
        collections={data.collections}
        isBusy={isBusy}
        saveOutput={saveOutput}
        onLoad={onLoad}
      />
      <ApprovedMemory task={task} isBusy={isBusy} onRecall={recallPreference} />
      <ReviewSharing
        task={task}
        shares={data.shares}
        reviews={data.reviews}
        isBusy={isBusy}
        saveOutput={saveOutput}
        onRefresh={refresh}
      />
      <ComparisonAssessment
        task={task}
        isBusy={isBusy}
        saveOutput={saveOutput}
        setStatus={setStatusMessage}
      />
    </div>
  );
}

function OutcomeExport({ task }: { task: Task }) {
  const main = task.artifacts.find((artifact) => artifact.id === "main");

  return (
    <section>
      <h3>Export the current outcome</h3>
      <p>
        Includes selected text, assumptions, evidence timestamps and freshness.
        Private profiles and execution logs are excluded; review your own
        document wording before sharing.
      </p>
      <div className="outcome-actions">
        {["markdown", "json"].map((format) => (
          <a
            key={format}
            aria-disabled={!main}
            href={
              main
                ? `/api/tasks/${task.id}/export?format=${format}&version=${task.brief.version}`
                : undefined
            }
            download
          >
            Download {format === "json" ? "evidence JSON" : "Markdown"}
          </a>
        ))}
      </div>
    </section>
  );
}

function ApprovedMemory({
  task,
  isBusy,
  onRecall,
}: {
  task: Task;
  isBusy: boolean;
  onRecall: (preferenceId: string, participantId: string) => Promise<void>;
}) {
  const [memory, setMemory] = useState("");
  const [target, setTarget] = useState("");

  return (
    <section>
      <h3>Use approved taste memory</h3>
      <p>
        Saved tastes retain their original participant attribution. Apply one
        explicitly to a chosen participant; Igor never assumes the sample group
        describes you.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onRecall(memory, target);
        }}
      >
        <label htmlFor="saved-taste">Saved preference</label>
        <select
          id="saved-taste"
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          required
        >
          <option value="">Choose saved taste</option>
          {task.preferences.map((preference) => (
            <option value={preference.id} key={preference.id}>
              {preference.value} · {preference.polarity} · from{" "}
              {preference.subject}
            </option>
          ))}
        </select>
        <label htmlFor="taste-target">Apply to</label>
        <select
          id="taste-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          required
        >
          <option value="">Choose participant</option>
          {task.brief.participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.name}
            </option>
          ))}
        </select>
        <button disabled={isBusy || !memory || !target}>
          Apply approved preference
        </button>
      </form>
      <p className="micro">
        Save or forget tastes in the brief&apos;s Approved memory section.
      </p>
    </section>
  );
}

function ComparisonAssessment({
  task,
  isBusy,
  saveOutput,
  setStatus,
}: {
  task: Task;
  isBusy: boolean;
  saveOutput: SaveOutput;
  setStatus: (message: string) => void;
}) {
  const [blind, setBlind] = useState<BlindComparison | null>(null);
  const [choice, setChoice] = useState<
    "A" | "B" | "no-preference" | "insufficient-evidence"
  >("no-preference");
  const [reason, setReason] = useState("");
  const name = (id: string) =>
    task.candidates.find((candidate) => candidate.id === id)?.name ?? id;

  return (
    <section>
      <h3>Assess the actual comparison</h3>
      <p>
        First run the baseline comparison in Evidence. Here the two outputs are
        randomly ordered and hidden behind A/B until you assess them. No
        preference and insufficient evidence are valid answers.
      </p>
      <button
        disabled={
          isBusy ||
          task.evaluation?.status !== "ok" ||
          task.evaluation.version !== task.brief.version
        }
        onClick={async () => {
          const comparison = await saveOutput({ type: "blind-comparison" });

          if (comparison) {
            setBlind(comparison);
          }
        }}
      >
        Prepare blinded comparison
      </button>
      {blind && (
        <>
          <div className="blind-options">
            {(["A", "B"] as const).map((arm) => (
              <div key={arm}>
                <h4>Option {arm}</h4>
                <ol>
                  {blind[arm].map((id) => (
                    <li key={id}>{name(id)}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const assessment = await saveOutput({
                type: "assessment",
                id: blind.id,
                choice,
                reason,
              });

              if (assessment) {
                setStatus(
                  `Assessment saved. A was ${assessment.aIsBaseline ? "LLM-only" : "Qloo-assisted"}. This records your judgment, not a general performance claim.`,
                );
                setBlind(null);
                setReason("");
              }
            }}
          >
            <label htmlFor="assessment-choice">Your judgment</label>
            <select
              id="assessment-choice"
              value={choice}
              onChange={(event) => {
                const value = event.target.value;

                if (
                  value === "A" ||
                  value === "B" ||
                  value === "no-preference" ||
                  value === "insufficient-evidence"
                ) {
                  setChoice(value);
                }
              }}
            >
              <option value="no-preference">No preference</option>
              <option value="insufficient-evidence">
                Insufficient evidence
              </option>
              <option value="A">Prefer A</option>
              <option value="B">Prefer B</option>
            </select>
            <label htmlFor="assessment-reason">
              What affected the decision?
            </label>
            <textarea
              id="assessment-reason"
              required
              value={reason}
              maxLength={1500}
              onChange={(e) => setReason(e.target.value)}
            />
            <button disabled={isBusy || !reason.trim()}>
              Record assessment
            </button>
          </form>
        </>
      )}
    </section>
  );
}
