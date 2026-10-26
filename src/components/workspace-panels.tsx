"use client";
import { SlidersHorizontal, Plus, X } from "lucide-react";
import type { Task, TaskAction } from "@/core/contracts";
import { ConstraintEditor, ParticipantEditor } from "./task-editors";

export function WorkspaceBrief({
  task,
  isBusy,
  onTurn,
}: {
  task: Task | null;
  isBusy: boolean;
  onTurn: (action: TaskAction) => void;
}) {
  return (
    <aside className="brief-column" aria-label="Editable brief">
      <div className="section-title">
        <span>The brief</span>
        <SlidersHorizontal size={16} />
      </div>
      <p className="brief-caption">
        A few particulars.
        <br />
        Room for everyone.
      </p>
      {task ? (
        <>
          <ConstraintEditor
            key={`${task.id}:${task.brief.constraints.budget}:${task.brief.constraints.duration}:${task.brief.constraints.location}`}
            task={task}
            busy={isBusy}
            onSave={onTurn}
          />
          <div className="section-title participants-heading">
            <span>People at the table</span>
            <span className="count">{task.brief.participants.length}</span>
          </div>
          <p className="micro muted">Sample profiles · edit each person</p>
          <div className="people-list">
            {task.brief.participants.map((participant, index) => (
              <ParticipantEditor
                key={`${task.id}:${participant.id}:${participant.name}:${JSON.stringify(participant.preferences)}`}
                participant={participant}
                index={index}
                busy={isBusy}
                onSave={onTurn}
              />
            ))}
          </div>
          <button
            className="text-button add-person"
            disabled={isBusy || task.brief.participants.length >= 12}
            onClick={() =>
              onTurn({
                type: "participant",
                participant: {
                  id: `person-${Date.now()}`,
                  name: "New participant",
                  sample: false,
                  preferences: [],
                },
              })
            }
          >
            <Plus size={14} /> Add a participant
          </button>
          <details className="memory">
            <summary>Facts & assumptions</summary>
            {task.brief.suppliedFacts.map((fact, index) => (
              <p key={`fact:${index}`}>{fact}</p>
            ))}
            {task.brief.assumptions.map((fact, index) => (
              <p key={`assumption:${index}`}>Assumption: {fact}</p>
            ))}
          </details>
          <details className="memory">
            <summary>
              Approved memory <span>{task.preferences.length}</span>
            </summary>
            <p>
              Task profiles stay in this task. Save a confirmed preference
              explicitly to carry it into another workspace.
            </p>
            {task.preferences.map((preference) => (
              <div className="memory-person" key={`saved:${preference.id}`}>
                <strong>
                  {task.brief.participants.find(
                    (participant) => participant.id === preference.subject,
                  )?.name ?? preference.subject}
                </strong>
                <button
                  disabled={isBusy}
                  onClick={() =>
                    onTurn({
                      type: "memory",
                      preferenceId: preference.id,
                      operation: "delete",
                    })
                  }
                >
                  {preference.value}
                  <span>Remove saved preference</span>
                </button>
              </div>
            ))}
            {task.brief.participants.map((participant) => (
              <div key={participant.id} className="memory-person">
                <strong>{participant.name}</strong>
                {participant.preferences
                  .filter(
                    (savedPreference) =>
                      savedPreference.confirmed &&
                      savedPreference.polarity === "like",
                  )
                  .slice(0, 3)
                  .map((preference) => (
                    <button
                      key={preference.id}
                      disabled={isBusy}
                      onClick={() =>
                        onTurn({
                          type: "memory",
                          preferenceId: preference.id,
                          operation: task.preferences.some(
                            (savedPreference) =>
                              savedPreference.id === preference.id,
                          )
                            ? "delete"
                            : "save",
                        })
                      }
                    >
                      {preference.value}
                      <span>
                        {task.preferences.some(
                          (savedPreference) =>
                            savedPreference.id === preference.id,
                        )
                          ? "Remove"
                          : "Save"}
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </details>
        </>
      ) : (
        <div className="loading-brief">Preparing your workspace…</div>
      )}
    </aside>
  );
}

export function ExecutionDetails({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  return (
    <aside className="evidence-column" aria-label="Execution details">
      <div className="section-title">
        Behind the result
        <button
          className="icon-button"
          aria-label="Close evidence panel"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <p className="helper muted">Evidence travels with the work.</p>
      <div className="trace-list">
        {[...task.trace].reverse().map((entry) => (
          <div className="trace-item" key={entry.id}>
            <span className="trace-dot" />
            <strong>{entry.action}</strong>
            <p>{entry.outcome}</p>
            <small>
              v{entry.version} · {entry.durationMs}ms · {entry.requests}{" "}
              external requests
            </small>
          </div>
        ))}
      </div>
      {!task.trace.length && (
        <p className="empty-note">
          Actual execution events appear here when you start a task.
        </p>
      )}
    </aside>
  );
}
