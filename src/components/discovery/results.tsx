import Image from "next/image";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Film,
  LoaderCircle,
  MapPin,
  Music2,
} from "lucide-react";
import { useState } from "react";
import type { Task, TaskAction } from "@/core/contracts";
import { DiscoveryDialog } from "./dialog";
import {
  currentCandidates,
  seedNames,
  sourceLabel,
  typeLabel,
  type DiscoveryCandidate,
} from "./model";
import { DiscoveryOutcome } from "./outcome";

export function DiscoveryResults({
  task,
  busy,
  executionMessage,
  onTurn,
}: {
  task: Task;
  busy: boolean;
  executionMessage: string;
  onTurn: (action: TaskAction) => void;
}) {
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evidenceVisible, setEvidenceVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const lastMessage = task.messages.at(-1);
  const conversation =
    !busy &&
    lastMessage?.role === "assistant" &&
    lastMessage.kind === "conversation"
      ? lastMessage.text
      : null;
  const candidates = currentCandidates(task);
  const types = [...new Set(candidates.map((candidate) => candidate.type))];
  const visible = candidates.filter(
    (candidate) => category === "All" || candidate.type === category,
  );
  const lead = visible[0];
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  const evidence = task.evidence.filter((item) => item.freshness === "current");
  const staleCount = task.candidates.length - candidates.length;
  const title =
    task.brief.targetType === "place"
      ? `A different side of ${task.brief.constraints.location}.`
      : task.brief.contextAnchor
        ? `Where ${task.brief.contextAnchor.name} leads.`
        : task.brief.kind === "gathering"
          ? "Different tastes. Common ground."
          : "One good thing leads to another.";

  async function saveReference(candidate: DiscoveryCandidate) {
    if (saving || busy) {
      return;
    }

    setSaving(true);
    setSaveMessage("");

    try {
      const response = await fetch(`/api/tasks/${task.id}/outputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "collection",
          version: task.brief.version,
          title: candidate.name,
          candidateIds: [candidate.id],
        }),
      });

      if (!response.ok) {
        throw new Error("This reference could not be saved. Please try again.");
      }

      setSaved((previous) => [...new Set([...previous, candidate.id])]);
      setSaveMessage(`${candidate.name} saved as a reference collection.`);
    } catch (error) {
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "Could not save this reference.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ig-results" aria-busy={busy}>
      {(!conversation || task.brief.goal) && (
        <header className="ig-result-heading">
          <div className="ig-eyebrow">
            <span className="ig-small-orbit" aria-hidden="true" />{" "}
            {task.brief.kind === "gathering"
              ? "A SHARED STARTING POINT"
              : "FOLLOWING THE THREAD"}
          </div>
          <h1>{title}</h1>
          <p className="ig-goal">
            {task.brief.goal || "Finding your next starting point."}
          </p>
          <div className="ig-result-meta">
            <span>
              {task.mode === "illustrative-fixtures"
                ? "Illustrative example"
                : "Qloo cultural connections"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{candidates.length} discoveries</span>
            <button type="button" onClick={() => setEvidenceVisible(true)}>
              Behind the connections <ArrowUpRight size={14} />
            </button>
          </div>
        </header>
      )}
      {conversation && (
        <section className="ig-clarification" aria-label="Igor’s reply">
          {!task.brief.goal && <h1>Let’s start with you.</h1>}
          <p>{conversation}</p>
        </section>
      )}

      {busy && (
        <div className="ig-progress" role="status">
          <LoaderCircle className="ig-spin" size={19} />
          <div>
            <strong>Taking the scenic route.</strong>
            <span>
              {executionMessage || "Following your taste across culture..."}
            </span>
          </div>
          <span className="ig-progress-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      {task.brief.unresolved.length > 0 && (
        <section className="ig-clarification">
          <span className="ig-eyebrow">ONE QUICK QUESTION</span>
          <h2>Let’s get this part right.</h2>
          {task.brief.unresolved.map((question) => (
            <p key={question}>{question}</p>
          ))}
          {task.entities
            .filter((entity) => entity.status === "ambiguous")
            .map((entity) => (
              <div className="ig-identity-choices" key={entity.id}>
                {entity.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onTurn({
                        type: "resolve",
                        entityId: entity.id,
                        choiceId: choice.id,
                      })
                    }
                  >
                    {choice.name}
                    <small>{choice.metadata}</small>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            ))}
        </section>
      )}
      {task.error && (
        <p role="alert" className="ig-error">
          {task.error}
        </p>
      )}
      {staleCount > 0 && (
        <p role="status" className="ig-stale-note">
          {staleCount} previous{" "}
          {staleCount === 1 ? "connection is" : "connections are"} being
          rechecked after your changes.
        </p>
      )}

      {candidates.length > 0 && (
        <>
          <div className="ig-results-section-heading">
            <h2>
              {task.brief.targetType === "place"
                ? "The city, through another lens"
                : "A few unexpected turns"}
              <span>↴</span>
            </h2>
            <div
              className="ig-filters"
              role="group"
              aria-label="Filter discoveries"
            >
              {["All", ...types].map((type) => (
                <button
                  type="button"
                  key={type}
                  aria-pressed={category === type}
                  onClick={() => {
                    setCategory(type);
                    setExpanded(false);
                  }}
                >
                  {type === "All"
                    ? "Everything"
                    : typeLabel(type as DiscoveryCandidate["type"])}
                </button>
              ))}
            </div>
          </div>
          {lead ? (
            <div
              className={`ig-editorial-results ${lead.type === "place" ? "ig-place-results" : ""}`}
            >
              <button
                className="ig-lead"
                type="button"
                onClick={() => setSelectedId(lead.id)}
                aria-label={`Explore ${lead.name}`}
              >
                <CandidateVisual candidate={lead} prominent />
                <span className="ig-lead-info">
                  <span className="ig-eyebrow">
                    {typeLabel(lead.type)} <span>·</span> {sourceLabel(lead)}
                  </span>
                  <strong>{lead.name}</strong>
                  <span className="ig-lead-description">
                    {lead.description || "A cultural connection to follow."}
                  </span>
                  <span className="ig-lead-action">
                    Look a little closer <ArrowUpRight size={17} />
                  </span>
                </span>
              </button>
              <div className="ig-connections-list">
                <div className="ig-list-label">
                  KEEP FOLLOWING <ArrowDown size={13} />
                </div>
                {visible.slice(1, 5).map((candidate, index) => (
                  <button
                    type="button"
                    className="ig-connection-row"
                    key={candidate.id}
                    onClick={() => setSelectedId(candidate.id)}
                  >
                    <span className="ig-row-number">
                      {String(index + 2).padStart(2, "0")}
                    </span>
                    <CandidateVisual candidate={candidate} />
                    <span className="ig-row-copy">
                      <small>
                        {typeLabel(candidate.type)}{" "}
                        <span>· {sourceLabel(candidate)}</span>
                      </small>
                      <strong>{candidate.name}</strong>
                      <span>
                        {candidate.place?.address ||
                          candidate.description ||
                          "Explore the connection"}
                      </span>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="ig-empty">
              No current results in this category. Choose Everything.
            </p>
          )}
          {visible.length > 5 && (
            <>
              <button
                className="ig-more-button"
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
              >
                {expanded
                  ? "A little less"
                  : `Keep going · ${visible.length - 5} more connections`}{" "}
                <ChevronDown size={16} />
              </button>
              {expanded && (
                <div className="ig-more-grid">
                  {visible.slice(5).map((candidate) => (
                    <button
                      type="button"
                      className="ig-more-item"
                      key={candidate.id}
                      onClick={() => setSelectedId(candidate.id)}
                    >
                      <CandidateVisual candidate={candidate} />
                      <span>
                        <small>{typeLabel(candidate.type)}</small>
                        <strong>{candidate.name}</strong>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {!busy &&
        !conversation &&
        !candidates.length &&
        !task.brief.unresolved.length && (
          <section className="ig-empty-result">
            <span aria-hidden="true">↗</span>
            <h2>A new direction needs a starting point.</h2>
            <p>
              No current cultural results were returned. Try an artist, a film,
              or a city in the conversation below.
            </p>
          </section>
        )}
      <DiscoveryOutcome task={task} />
      {saveMessage && (
        <p className="ig-save-message" role="status">
          {saveMessage}
        </p>
      )}

      <DiscoveryDialog
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.name || "A closer look"}
      >
        {selected && (
          <>
            <div className="ig-detail-intro">
              <CandidateVisual candidate={selected} />
              <div>
                <span className="ig-eyebrow">
                  {typeLabel(selected.type)} · {sourceLabel(selected)}
                </span>
                <p>
                  {selected.description ||
                    "A reference returned for this exploration."}
                </p>
                {selected.place?.address && (
                  <p className="ig-address">
                    <MapPin size={14} />
                    {selected.place.address}
                  </p>
                )}
              </div>
            </div>
            <ConnectionContext task={task} candidate={selected} />
            <div className="ig-detail-actions">
              <button
                className="ig-primary"
                type="button"
                disabled={busy || saving || saved.includes(selected.id)}
                onClick={() => void saveReference(selected)}
              >
                {saved.includes(selected.id) ? (
                  <Check size={16} />
                ) : (
                  <Bookmark size={16} />
                )}
                {saved.includes(selected.id)
                  ? "Reference saved"
                  : saving
                    ? "Saving..."
                    : "Save reference"}
              </button>
              {selected.providerId && selected.cultural && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSelectedId(null);
                      onTurn({
                        type: "connection",
                        candidateId: selected.id,
                        targetType: "artist",
                      });
                    }}
                  >
                    <Music2 size={16} /> Into music <ArrowUpRight size={15} />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSelectedId(null);
                      onTurn({
                        type: "connection",
                        candidateId: selected.id,
                        targetType: "movie",
                      });
                    }}
                  >
                    <Film size={16} /> Into film <ArrowUpRight size={15} />
                  </button>
                </>
              )}
            </div>
            {saveMessage && (
              <p role="status" className="ig-save-message">
                {saveMessage}
              </p>
            )}
            <details className="ig-practical-details">
              <summary>
                Practical details <ChevronDown size={15} />
              </summary>
              <dl>
                <dt>Cost</dt>
                <dd>
                  {selected.cost.value === null
                    ? "Unknown"
                    : `$${selected.cost.value} · ${selected.cost.source}`}
                </dd>
                <dt>Availability</dt>
                <dd>
                  {selected.available === null
                    ? "Not confirmed"
                    : `${selected.available ? "Available" : "Unavailable"} · ${selected.availabilitySource}`}
                </dd>
              </dl>
              {selected.place?.website && (
                <a
                  href={selected.place.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  Visit source website <ArrowUpRight size={14} />
                </a>
              )}
            </details>
          </>
        )}
      </DiscoveryDialog>

      <DiscoveryDialog
        open={evidenceVisible}
        onClose={() => setEvidenceVisible(false)}
        title="Behind the connections"
      >
        <p className="ig-dialog-intro">
          Qloo finds cultural associations. It doesn’t establish prices, opening
          hours or personal preference.
        </p>
        {task.mode === "illustrative-fixtures" && (
          <p className="ig-stale-note">
            Illustrative test data. These are not live Qloo results.
          </p>
        )}
        {!evidence.length && (
          <p className="ig-empty">No current evidence has returned yet.</p>
        )}
        <div className="ig-evidence-list">
          {evidence.map((record) => (
            <article key={record.id}>
              <span className="ig-eyebrow">
                {record.source} {record.delivery && `· ${record.delivery}`}
              </span>
              <p>{record.summary}</p>
              <time dateTime={record.at}>
                {new Date(record.at).toLocaleString()}
              </time>
              {record.limitations.map((limitation) => (
                <small key={limitation}>{limitation}</small>
              ))}
            </article>
          ))}
        </div>
      </DiscoveryDialog>
    </div>
  );
}

function CandidateVisual({
  candidate,
  prominent = false,
}: {
  candidate: DiscoveryCandidate;
  prominent?: boolean;
}) {
  return (
    <span
      className={`ig-candidate-visual ig-visual-${candidate.type} ${prominent ? "ig-visual-prominent" : ""}`}
    >
      {candidate.imageUrl ? (
        <Image
          src={candidate.imageUrl}
          alt=""
          fill
          sizes={prominent ? "(max-width: 760px) 90vw, 38vw" : "100px"}
          unoptimized
        />
      ) : (
        <span aria-hidden="true">{candidate.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

function ConnectionContext({
  task,
  candidate,
}: {
  task: Task;
  candidate: DiscoveryCandidate;
}) {
  const seeds = seedNames(task, candidate);
  const signals = Object.values(candidate.cultural ?? {});

  return (
    <div className="ig-connection-context">
      <span className="ig-eyebrow">THE THREAD</span>
      <div className="ig-thread-path">
        <span>{seeds.join(" + ") || "Your exploration"}</span>
        <ArrowRight size={20} />
        <strong>{candidate.name}</strong>
      </div>
      <p>
        {candidate.sample
          ? "An illustrative example, not a live cultural association."
          : signals.length
            ? "Returned in this Qloo query. A connection to explore, rather than a prediction of what you’ll like."
            : "A supplied reference. No Qloo association is attached."}
      </p>
      {signals.length > 0 && (
        <details>
          <summary>
            See the source <ChevronDown size={14} />
          </summary>
          {signals.map((signal, index) => (
            <div className="ig-signal" key={`${signal.queryId}:${index}`}>
              <p>
                {signal.delivery} · query rank {signal.rank} ·{" "}
                {new Date(signal.retrievedAt).toLocaleString()}
              </p>
              <p>
                {signal.explanationScope === "recommendation"
                  ? "Provider returned a per-result explanation."
                  : "Query seeds describe the search context, not a per-result causal explanation."}
              </p>
              <code>{signal.queryId}</code>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
