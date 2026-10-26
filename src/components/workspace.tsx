"use client";

import { ProgrammeView } from "./programme-view";
import { WorkspaceBrief, ExecutionDetails } from "./workspace-panels";

import { useState } from "react";
import { useWorkspace, type WorkspaceView } from "./use-workspace";
import {
  ArrowUpRight,
  ArrowUp,
  ArrowRight,
  Plus,
  NotebookPen,
  Users,
  ScanLine,
  PanelRightClose,
  PanelRightOpen,
  AlertCircle,
  Compass,
  Clock,
  LoaderCircle,
  X,
  CheckCheck,
} from "lucide-react";
import Link from "next/link";
import type { CandidateInput, Task } from "@/core/contracts";
import { ArtifactEditor, PersonalStart } from "./task-editors";
import { EvidenceView } from "./evidence-view";
import { CandidateComparison } from "./candidate-comparison";
import { AccountDialog } from "./account-panel";
import { Connections, OutcomeWorkspace } from "./outcome-workspace";
import { gatheringExamples } from "@/data/examples";

export function Workspace() {
  const {
    task,
    acceptTask,
    isBusy,
    errorMessage,
    setErrorMessage,
    activeView,
    setActiveView,
    executionMessage,
    history,
    loadHistory,
    createWorkspace,
    openWorkspace,
    sendTurn,
  } = useWorkspace();
  const [details, setDetails] = useState(false);
  const [message, setMessage] = useState("");
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [catalogueText, setCatalogueText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const invitation = task?.artifacts.find(
    (artifact) => artifact.id === "invitation",
  );

  return (
    <div className="shell">
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
      <aside className="rail" aria-label="Workspace navigation">
        <Link className="wordmark" href="/" aria-label="Igor home">
          igor<span>·</span>
        </Link>
        <button className="rail-link active" aria-label="Current workspace">
          <NotebookPen size={20} />
          <span>Workspace</span>
        </button>
        <button
          className="rail-link"
          onClick={async () => {
            setHistoryOpen(!historyOpen);
            await loadHistory();
          }}
          aria-expanded={historyOpen}
        >
          <Clock size={20} />
          <span>History</span>
        </button>
        <button
          className="rail-link"
          disabled={!task || isBusy}
          onClick={() => setAccountOpen(true)}
        >
          <Users size={20} />
          <span>Account</span>
        </button>
        <button
          className="rail-link"
          onClick={() => setDetails(!details)}
          aria-expanded={details}
        >
          <ScanLine size={20} />
          <span>Evidence</span>
        </button>
        <div className="rail-bottom">
          <span className="avatar own">Y</span>
          <span>
            Your space
            <br />
            <small>Local development</small>
          </span>
        </div>
      </aside>
      <div className="workspace-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Your workspace <span>/</span>{" "}
            <strong>
              {task?.brief.goal
                ? "A little common ground"
                : "Untitled exploration"}
            </strong>
          </div>
          <div className="top-actions">
            <span className="fixture-badge">
              <span />
              {task?.mode === "qloo-live"
                ? "Qloo connection"
                : "Illustrative fixtures"}
            </span>
            <button
              className="icon-button"
              title="New workspace"
              aria-label="New workspace"
              onClick={createWorkspace}
              disabled={isBusy}
            >
              <Plus size={19} />
            </button>
            <button
              className="icon-button"
              title="Toggle evidence panel"
              aria-label="Toggle evidence panel"
              onClick={() => setDetails(!details)}
            >
              {details ? (
                <PanelRightClose size={19} />
              ) : (
                <PanelRightOpen size={19} />
              )}
            </button>
          </div>
        </header>
        <div
          className="mode-note"
          title={
            task?.modelMode === "tool-calling"
              ? "Tool-calling model configured on the server"
              : "Bounded scripted interpretation; no model provider configured"
          }
        >
          <span className="tiny-mark">i</span>
          <span>
            {task?.mode === "qloo-live" ? (
              "Sample profiles. Cultural results carry LIVE or CACHED provenance. Supply practical facts before planning; missing credentials block retrieval."
            ) : (
              <>
                A working local prototype. Sample profiles, cultural connections
                and costs are illustrative.{" "}
                <strong>No live Qloo requests.</strong>
              </>
            )}
          </span>
          <button
            onClick={() => {
              setActiveView("evidence");
            }}
          >
            See provenance <ArrowUpRight size={13} />
          </button>
        </div>
        {historyOpen && (
          <section className="history-pop" aria-label="Workspace history">
            <div className="section-title">
              Recent work
              <button
                className="icon-button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close history"
              >
                <X size={16} />
              </button>
            </div>
            {history.length ? (
              history.map((savedWorkspace) => (
                <button
                  key={savedWorkspace.id}
                  onClick={async () => {
                    if (await openWorkspace(savedWorkspace.id)) {
                      setHistoryOpen(false);
                    }
                  }}
                >
                  {savedWorkspace.goal || "Untitled exploration"}
                  <ArrowUpRight size={14} />
                </button>
              ))
            ) : (
              <p>No previous work yet.</p>
            )}
          </section>
        )}
        <div className={`workspace-grid ${details ? "with-evidence" : ""}`}>
          <WorkspaceBrief task={task} isBusy={isBusy} onTurn={sendTurn} />
          <main className="main-column" id="main-workspace">
            <div className="document-heading">
              <div>
                <div className="eyebrow">An exploration, together</div>
                <h1>
                  {task?.brief.kind === "creative"
                    ? "An idea, taking shape."
                    : task?.brief.kind === "discovery"
                      ? "Follow your curiosity."
                      : "A little common ground."}
                </h1>
                <p>
                  {task?.brief.kind === "gathering"
                    ? "Different tastes. One considered result."
                    : "Connect the references. Make something useful."}
                </p>
              </div>
              <span className="document-number">01</span>
            </div>
            <div className="document-toolbar">
              <div className="tabs" role="tablist" aria-label="Workspace views">
                {workspaceViews.map((view) => (
                  <button
                    key={view}
                    role="tab"
                    aria-selected={activeView === view}
                    onClick={() => setActiveView(view)}
                  >
                    {viewLabel(view, task)}
                  </button>
                ))}
              </div>
              <span className="version">v{task?.brief.version ?? 0}</span>
            </div>
            <div className="document-content">
              {!task?.brief.goal ? (
                <section className="welcome">
                  <div className="welcome-icon">
                    <Compass size={29} strokeWidth={1.3} />
                  </div>
                  <h2>
                    Start with what you
                    <br />
                    want to make possible.
                  </h2>
                  <p>
                    Explore a connection, find a compromise, or turn an idea
                    into something you can use. The brief travels with you.
                  </p>
                  <button
                    className="primary-button"
                    disabled={isBusy || !task}
                    onClick={() => sendTurn({ type: "sample" })}
                  >
                    Try the six-person evening <ArrowRight size={16} />
                  </button>
                  <div className="welcome-alternatives">
                    <button
                      disabled={isBusy || !task}
                      onClick={() =>
                        sendTurn({ type: "place-example", city: "Tokyo" })
                      }
                    >
                      Explore Tokyo through Radiohead <ArrowUpRight size={14} />
                    </button>

                    <button
                      disabled={isBusy || !task}
                      onClick={() =>
                        sendTurn({
                          type: "message",
                          text: "Discover films and music from our confirmed tastes.",
                        })
                      }
                    >
                      Follow a cultural connection <ArrowUpRight size={14} />
                    </button>
                    <button
                      disabled={isBusy || !task}
                      onClick={() =>
                        sendTurn({
                          type: "message",
                          text: "Create a creative brief for a reflective, warm listening club.",
                        })
                      }
                    >
                      Develop a creative direction <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <PersonalStart busy={isBusy} send={sendTurn} />
                  <small>
                    The example buttons use labelled sample profiles. Your own
                    taste is supplied explicitly.
                  </small>
                  {task?.mode === "qloo-live" &&
                    gatheringExamples.slice(1).map((example, i) => (
                      <button
                        className="secondary-button"
                        key={example.name}
                        disabled={isBusy}
                        title={example.note}
                        onClick={() =>
                          sendTurn({
                            type: "sample",
                            example: i === 0 ? "short" : "budget",
                          })
                        }
                      >
                        {example.name}
                      </button>
                    ))}
                </section>
              ) : activeView === "connections" ? (
                <Connections task={task} onTurn={sendTurn} />
              ) : activeView === "keep" ? (
                <OutcomeWorkspace
                  key={task.id}
                  task={task}
                  onTask={acceptTask}
                  onLoad={openWorkspace}
                  onTurn={sendTurn}
                />
              ) : activeView === "programme" ? (
                <ProgrammeView
                  task={task}
                  isBusy={isBusy}
                  onTurn={sendTurn}
                  onEvidence={() => setActiveView("evidence")}
                />
              ) : activeView === "options" ? (
                <CandidateComparison
                  task={task}
                  busy={isBusy}
                  onAction={sendTurn}
                  onReplaceCatalogue={() => {
                    setCatalogueText(JSON.stringify(task.catalogue, null, 2));
                    setCatalogueOpen(true);
                  }}
                />
              ) : activeView === "invitation" ? (
                <>
                  <div className="working-title">
                    <span className="artifact-type">Editable invitation</span>
                    <span
                      className={`freshness ${invitation?.freshness === "stale" ? "stale" : ""}`}
                    >
                      {invitation?.freshness ?? "Not drafted"}
                    </span>
                  </div>
                  <h2 className="artifact-title">
                    A note to bring everyone together.
                  </h2>
                  <p className="helper muted">
                    Make it sound like you. Wording edits never call cultural
                    discovery.
                  </p>
                  {invitation ? (
                    <ArtifactEditor
                      key={`${invitation.id}:${invitation.version}`}
                      artifact={invitation}
                      disabled={isBusy}
                      save={sendTurn}
                    />
                  ) : (
                    <p className="empty-note">
                      An invitation will appear after a feasible selection.
                    </p>
                  )}
                  <p className="micro muted">
                    Draft only. Igor does not send messages or book anything.
                  </p>
                </>
              ) : (
                <EvidenceView task={task} busy={isBusy} onAction={sendTurn} />
              )}
            </div>
            <section className="conversation" aria-label="Conversation">
              <div className="conversation-history" aria-live="polite">
                {task?.messages.slice(-2).map((m, i) => (
                  <div className={`message ${m.role}`} key={`${m.at}-${i}`}>
                    <span>{m.role === "user" ? "You" : "Igor"}</span>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>
              {(errorMessage || task?.error) && (
                <div className="error-banner" role="alert">
                  <AlertCircle size={16} />
                  {errorMessage || task?.error}
                </div>
              )}
              <div className="execution-progress" role="status">
                {isBusy ? (
                  <>
                    <LoaderCircle size={13} className="spin" />
                    {executionMessage || "Working through your request…"}
                  </>
                ) : task?.brief.goal ? (
                  <>
                    <CheckCheck size={13} />
                    Saved locally ·{" "}
                    {
                      task.trace.filter(
                        (view) => view.action === "cultural.discover",
                      ).length
                    }{" "}
                    {task.mode === "qloo-live"
                      ? `discovery runs · ${task.trace.reduce((total, view) => total + view.requests, 0)} external requests`
                      : "fixture discovery calls · 0 live requests"}
                  </>
                ) : (
                  <>
                    <span className="status-dot" />
                    Ready when you are
                  </>
                )}
              </div>
              <form
                className="composer"
                onSubmit={(event) => {
                  event.preventDefault();

                  if (message.trim()) {
                    sendTurn({ type: "message", text: message });
                    setMessage("");
                  }
                }}
              >
                <label className="sr-only" htmlFor="goal-input">
                  Tell Igor your goal or correction
                </label>
                <textarea
                  id="goal-input"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();

                      if (message.trim() && !isBusy) {
                        sendTurn({ type: "message", text: message });
                        setMessage("");
                      }
                    }
                  }}
                  placeholder="What would you like to make possible?"
                  rows={2}
                  maxLength={3000}
                />
                <button
                  aria-label="Send message"
                  disabled={isBusy || !task || !message.trim()}
                >
                  <ArrowUp size={19} />
                </button>
              </form>
              <div className="composer-foot">
                <span>Discover. Compose. Find common ground.</span>
                <span>Enter to send · Shift + Enter for a new line</span>
              </div>
            </section>
          </main>
          {details && task && (
            <ExecutionDetails task={task} onClose={() => setDetails(false)} />
          )}
        </div>
      </div>
      {catalogueOpen && (
        <div className="modal-backdrop">
          <section
            className="catalogue-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalogue-title"
          >
            <div className="section-title">
              <h2 id="catalogue-title">Your catalogue, your facts.</h2>
              <button
                className="icon-button"
                aria-label="Close catalogue editor"
                onClick={() => setCatalogueOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p>
              Replace the sample options. Use <code>null</code> for unknown
              cost, duration or availability. Mark your facts as user-supplied;
              do not claim external verification.
            </p>
            <textarea
              aria-label="Catalogue JSON"
              value={catalogueText}
              onChange={(event) => setCatalogueText(event.target.value)}
              spellCheck={false}
            />
            <button
              className="primary-button"
              disabled={isBusy}
              onClick={() => {
                try {
                  const options = JSON.parse(catalogueText) as CandidateInput[];
                  sendTurn({ type: "catalogue", options });
                  setCatalogueOpen(false);
                } catch {
                  setErrorMessage("Catalogue must be valid JSON.");
                }
              }}
            >
              Use these options <ArrowRight size={15} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

const workspaceViews: WorkspaceView[] = [
  "programme",
  "options",
  "connections",
  "invitation",
  "keep",
  "evidence",
];

function viewLabel(view: WorkspaceView, task: Task | null): string {
  if (view === "programme") {
    const outcomeKind = task?.brief.outcome?.kind;

    if (outcomeKind) {
      return {
        itinerary: "Itinerary",
        listening: "Listening",
        research: "Research",
        "music-direction": "Music direction",
      }[outcomeKind];
    }

    if (task?.brief.kind === "creative") {
      return "Creative brief";
    }

    return task?.brief.kind === "discovery" ? "Discovery" : "Programme";
  }

  if (view === "options") {
    const count = task?.candidates.length ?? 0;

    return count ? `Options · ${count}` : "Options";
  }

  if (view === "keep") {
    return "Keep & share";
  }

  return view[0].toUpperCase() + view.slice(1);
}
