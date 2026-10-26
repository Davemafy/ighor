"use client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Download,
  FileText,
  Film,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Music2,
  Plus,
  Save,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { TaskCanvas } from "./task-canvas";
import { morphLayout } from "./mobile-transitions";
import { hasPendingInput, type TurnFeedback } from "./turn-feedback";
import type { Task, TaskAction, Candidate } from "@/core/contracts";
import type { SavedCollection, SaveOutput } from "./use-saved-outcomes";
import type { StoredShare, StoredReview } from "@/data/outcome-store";

export function ProductDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="pp-dialog"
      aria-labelledby={id}
      onCancel={onClose}
      onClose={onClose}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button onClick={onClose} aria-label="Close">
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function ProductComposer({
  value,
  onChange,
  onSubmit,
  inputRef,
  disabled,
  busy,
  compact = false,
  continuing = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  busy: boolean;
  compact?: boolean;
  continuing?: boolean;
}) {
  const id = useId();
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 180) + "px";
    }
  }, [value, inputRef]);
  return (
    <form
      className={`pp-compose ${compact ? "pp-compose-compact" : ""}`}
      data-filled={!!value.trim()}
      data-busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !disabled) onSubmit();
      }}
    >
      <label className="pp-visually-hidden" htmlFor={id}>
        Message Igor
      </label>
      <textarea
        id={id}
        ref={inputRef}
        value={value}
        maxLength={3000}
        rows={2}
        placeholder={
          continuing
            ? "Tell Igor what to change…"
            : "What would you like to do?"
        }
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.nativeEvent.isComposing &&
            !window.matchMedia("(pointer: coarse)").matches
          ) {
            e.preventDefault();
            if (value.trim() && !disabled) onSubmit();
          }
        }}
      />
      <div>
        <span className="pp-compose-hint">
          {busy && <span className="pp-compose-pulse" aria-hidden="true" />}
          {busy
            ? "Igor is responding. You can write your next message."
            : "Shift + Enter for a new line"}
        </span>
        <button disabled={disabled || !value.trim()} aria-label="Send message">
          {busy ? <LoaderCircle className="ig-spin" /> : <ArrowUp />}
        </button>
      </div>
    </form>
  );
}
function activityLabel(message: string) {
  if (message.includes("Diagnostic:")) return "The reply could not finish";
  if (message.startsWith("Validated a conversational"))
    return "Understood your message";
  if (message.startsWith("Validated supported goal"))
    return "Understood your goal and changes";
  if (message.startsWith("Marked ") && message.includes("stale"))
    return "Updating the work affected by your changes";
  return message;
}
function ExecutionFeedback({
  feedback,
  busy,
  onRetry,
}: {
  feedback: TurnFeedback | null;
  busy: boolean;
  onRetry: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!feedback) return;
    setSeconds(Math.floor((Date.now() - feedback.startedAt) / 1000));
    if (!busy) return;
    const id = setInterval(
      () => setSeconds(Math.floor((Date.now() - feedback.startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [busy, feedback?.startedAt]);
  if (!feedback) return null;
  const last = feedback.steps.at(-1);
  return (
    <div className={`pp-execution pp-execution-${feedback.state}`}>
      <div className="pp-execution-line" role="status" aria-live="polite">
        {busy ? (
          <LoaderCircle className="ig-spin" />
        ) : feedback.state === "error" ? (
          <MessageCircle />
        ) : (
          <Check />
        )}
        <span>
          {busy
            ? last
              ? activityLabel(last)
              : "Waiting for Igor"
            : feedback.state === "error"
              ? "This reply could not finish"
              : feedback.action.type === "canvas"
                ? "Changes saved"
                : "Reply complete"}
        </span>
        {busy && <time>{seconds}s</time>}
      </div>
      {busy && seconds >= 15 && (
        <p className="pp-wait-note">
          Still waiting for a response. Your message is here.
        </p>
      )}
      {feedback.steps.length > 0 && (
        <details className="pp-execution-history">
          <summary>
            {busy ? "View activity" : "What Igor did"}
            <ChevronDown />
          </summary>
          <ol>
            {feedback.steps.map((step, i) => (
              <li key={i}>
                {busy && i === feedback.steps.length - 1 ? (
                  <LoaderCircle className="ig-spin" />
                ) : (
                  <span className="pp-activity-dot" />
                )}
                {activityLabel(step)}
              </li>
            ))}
          </ol>
        </details>
      )}
      {feedback.state === "error" && (
        <div className="pp-retry">
          <p>{feedback.error || "Your conversation is still here."}</p>
          <button onClick={onRetry} disabled={busy}>
            Try again
            <ArrowRight />
          </button>
        </div>
      )}
    </div>
  );
}
export function ProductText({ text }: { text: string }) {
  return (
    <div className="pp-message-text">
      {text
        .split(/\n\n+/)
        .map((block, i) =>
          /^#{1,3} /.test(block) ? (
            <h3 key={i}>{block.replace(/^#{1,3} /, "")}</h3>
          ) : (
            <p key={i}>
              {block
                .split(/(\*\*[^*]+\*\*)/g)
                .map((part, j) =>
                  part.startsWith("**") ? (
                    <strong key={j}>{part.slice(2, -2)}</strong>
                  ) : (
                    part
                  ),
                )}
            </p>
          ),
        )}
    </div>
  );
}
function Artwork({ candidate }: { candidate: Candidate }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`pp-artwork pp-artwork-${candidate.type}`}>
      {candidate.imageUrl && !failed ? (
        <img
          src={candidate.imageUrl}
          alt={candidate.name}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <span>
            {candidate.type === "artist" ? (
              <Music2 />
            ) : candidate.type === "place" ? (
              <MapPin />
            ) : (
              <Film />
            )}
          </span>
          <strong>{candidate.name}</strong>
        </>
      )}
    </div>
  );
}
const categoryName = (t: string) =>
  ({
    artist: "Music",
    movie: "Film",
    tv_show: "Television",
    place: "Places",
    book: "Books",
  })[t] || t;
export function ProductResults({
  task,
  busy,
  feedback,
  onTurn,
  onWork,
}: {
  task: Task;
  busy: boolean;
  feedback: TurnFeedback | null;
  onTurn: (a: TaskAction) => void;
  onWork: () => void;
}) {
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false),
    [kept, setKept] = useState<string[]>([]);
  const [paneChoice, setPaneChoice] = useState<{
    surfaceId: string;
    pane: "thread" | "canvas";
  } | null>(null);
  // A new persisted canvas revision automatically opens the updated result.
  // A user's Conversation/Result selection remains in effect for that revision.
  const surfaceId = task.canvas?.surface.id ?? "";
  const pane =
    paneChoice?.surfaceId === surfaceId
      ? paneChoice.pane
      : task.canvas
        ? "canvas"
        : "thread";
  const candidates = task.candidates.filter((c) => c.freshness === "current"),
    types = [...new Set(candidates.map((c) => c.type))],
    shown = candidates.filter((c) => filter === "all" || c.type === filter),
    detail = candidates.find((c) => c.id === selected),
    records = task.evidence.filter((e) => detail?.evidenceIds.includes(e.id));
  async function keep(c: Candidate) {
    setSaving(true);
    setMessage("");
    try {
      const r = await fetch(`/api/tasks/${task.id}/outputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "collection",
          version: task.brief.version,
          title: c.name,
          candidateIds: [c.id],
        }),
      });
      if (!r.ok)
        throw Error("This reference could not be saved. Please try again.");
      setKept((v) => [...v, c.id]);
      setMessage("Saved to your collections.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }
  const end = useRef<HTMLDivElement>(null),
    scrollRegion = useRef<HTMLDivElement>(null),
    follow = useRef(true);
  const artifacts = task.artifacts.filter(
    (a) => a.freshness === "current" || busy,
  );
  const pending = hasPendingInput(task.messages, feedback);
  useEffect(() => {
    const read = () => {
      follow.current =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 240;
    };
    const region = scrollRegion.current;
    const observeRegion = () => {
      if (region && window.matchMedia("(max-width: 760px)").matches) {
        follow.current =
          region.scrollHeight - region.scrollTop - region.clientHeight < 240;
      }
    };
    window.addEventListener("scroll", read, { passive: true });
    region?.addEventListener("scroll", observeRegion, { passive: true });
    return () => {
      window.removeEventListener("scroll", read);
      region?.removeEventListener("scroll", observeRegion);
    };
  }, []);
  useEffect(() => {
    if (!busy && !follow.current) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth";
    if (window.matchMedia("(max-width: 760px)").matches) {
      if (pane === "thread") {
        const region = scrollRegion.current;
        region?.scrollTo({ top: region.scrollHeight, behavior });
      }
    } else {
      end.current?.scrollIntoView({ behavior, block: "end" });
    }
  }, [task.messages.length, feedback?.startedAt, busy, pane]);
  return (
    <div
      className={`pp-conversation ${task.canvas ? "pp-has-canvas" : artifacts.length ? "pp-has-work" : ""}`}
      data-pane={pane}
    >
      {task.canvas && (
        <div className="pp-mobile-switch" role="tablist" aria-label="Workspace views">
          <button
            role="tab"
            aria-selected={pane === "thread"}
            onClick={() => setPaneChoice({ surfaceId, pane: "thread" })}
          >
            Conversation
          </button>
          <button
            role="tab"
            aria-selected={pane === "canvas"}
            onClick={() => setPaneChoice({ surfaceId, pane: "canvas" })}
          >
            Your result
          </button>
        </div>
      )}
      {task.canvas && pane === "canvas" && feedback?.state === "error" && (
        <div className="pp-mobile-result-error" role="alert">
          <span>{feedback.error || "Igor could not finish this reply. Your work is preserved."}</span>
          <button
            disabled={busy}
            onClick={() => onTurn(feedback.action)}
          >
            Try again
          </button>
        </div>
      )}
      <div className="pp-thread-body" ref={scrollRegion}>
        <div
          className="pp-transcript"
          aria-label="Conversation"
          aria-busy={busy}
        >
          {task.messages.map((m, i) => (
            <article
              className={`pp-message pp-message-${m.role}`}
              key={m.at + String(i)}
            >
              <span>
                {m.role === "user" ? (
                  "You"
                ) : (
                  <>
                    <img
                      src="/marketing/assets/brand/igor-mark-white.svg"
                      alt=""
                    />
                    Igor
                  </>
                )}
              </span>
              <ProductText text={m.text} />
            </article>
          ))}
          {pending && (
            <article className="pp-message pp-message-user pp-message-pending">
              <span>You</span>
              <ProductText text={feedback?.input || ""} />
            </article>
          )}
          <ExecutionFeedback
            feedback={feedback}
            busy={busy}
            onRetry={() => {
              if (feedback) onTurn(feedback.action);
            }}
          />
          <div ref={end} />
        </div>
        {task.error && feedback?.state !== "error" && (
          <p className="pp-status" role="alert">
            {task.error}
          </p>
        )}
        {task.brief.unresolved.length > 0 && !busy && (
          <div className="pp-question">
            <h2>A little more context.</h2>
            {task.brief.unresolved.map((q) => (
              <p key={q}>{q}</p>
            ))}
            {task.entities
              .filter((e) => e.status === "ambiguous")
              .map((e) => (
                <div key={e.id}>
                  {e.choices.map((c) => (
                    <button
                      key={c.id}
                      disabled={busy}
                      onClick={() =>
                        onTurn({
                          type: "resolve",
                          entityId: e.id,
                          choiceId: c.id,
                        })
                      }
                    >
                      {c.name}
                      <ArrowRight />
                    </button>
                  ))}
                </div>
              ))}
          </div>
        )}
        {!task.canvas && candidates.length > 0 && (
          <section className="pp-results">
            <header>
              <div>
                <span>
                  {task.brief.targetType === "place"
                    ? task.brief.constraints.location
                    : "For this goal"}
                </span>
                <h1>{"References"}</h1>
              </div>
              <div className="pp-category-tabs" aria-label="Result categories">
                <button
                  aria-pressed={filter === "all"}
                  onClick={() => setFilter("all")}
                >
                  Everything
                </button>
                {types.map((t) => (
                  <button
                    key={t}
                    aria-pressed={filter === t}
                    onClick={() => setFilter(t)}
                  >
                    {categoryName(t)}
                  </button>
                ))}
              </div>
            </header>
            <div className="pp-result-grid">
              {shown.map((c) => (
                <article className="pp-result-card" key={c.id}>
                  <button
                    className="pp-result-open"
                    onClick={(event) => {
                      const artwork = event.currentTarget.querySelector<HTMLElement>(".pp-artwork");
                      artwork?.style.setProperty("view-transition-name", "igor-result-artwork");
                      morphLayout(() => {
                        setSelected(c.id);
                        artwork?.style.removeProperty("view-transition-name");
                      });
                    }}
                  >
                    <Artwork candidate={c} />
                    <div>
                      <small>
                        {categoryName(c.type)}
                        <span>
                          {c.sample
                            ? "Example"
                            : Object.values(c.cultural || {}).some(
                                  (x) => x.delivery === "LIVE",
                                )
                              ? "Qloo"
                              : "Recorded Qloo"}
                        </span>
                      </small>
                      <h3>{c.name}</h3>
                      {c.place?.address && <p>{c.place.address}</p>}
                    </div>
                  </button>
                  <button
                    className="pp-keep"
                    aria-label={`Save ${c.name}`}
                    disabled={saving || kept.includes(c.id)}
                    onClick={() => void keep(c)}
                  >
                    {kept.includes(c.id) ? <Check /> : <Bookmark />}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
      {task.canvas && <TaskCanvas task={task} busy={busy} onTurn={onTurn} />}
      {!task.canvas && artifacts.length > 0 && (
        <aside className="pp-work-pane" aria-label="Your work">
          <div className="pp-work-pane-heading">
            <span>
              <FileText />
              Your work
            </span>
            <button onClick={onWork}>
              Open editor
              <ArrowUpRight />
            </button>
          </div>
          {artifacts.map((a) => (
            <button
              className="pp-document-preview"
              key={a.id}
              onClick={onWork}
              disabled={a.freshness !== "current"}
            >
              <span className="pp-document-kind">
                {a.kind.replaceAll("-", " ")}
                {a.freshness !== "current" ? (
                  <span>Updating</span>
                ) : (
                  a.edited && <span>Edited by you</span>
                )}
              </span>
              <h2>{a.title}</h2>
              <div>
                <ProductText text={a.content.slice(0, 1800)} />
              </div>
              <span className="pp-document-open">
                Keep shaping this
                <ArrowRight />
              </span>
            </button>
          ))}
          <p>Ask for a change in the conversation. Your work updates here.</p>
        </aside>
      )}
      <ProductDialog
        open={!!detail}
        onClose={() => setSelected(null)}
        title="A closer look"
      >
        {detail && (
          <div className="pp-detail">
            <div className="pp-shared-artwork" style={{ viewTransitionName: "igor-result-artwork" }}>
              <Artwork candidate={detail} />
            </div>
            <div className="pp-detail-copy">
              <small>{categoryName(detail.type)}</small>
              <h1>{detail.name}</h1>
              <p>
                {detail.description ||
                  "A reference returned for this exploration."}
              </p>
              {detail.place?.address && (
                <p className="pp-address">
                  <MapPin />
                  {detail.place.address}
                </p>
              )}
              <div className="pp-detail-actions">
                <button
                  disabled={saving || kept.includes(detail.id)}
                  onClick={() => void keep(detail)}
                >
                  {kept.includes(detail.id) ? <Check /> : <Bookmark />}
                  {kept.includes(detail.id) ? "Saved" : "Save reference"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setSelected(null);
                    onTurn({
                      type: "message",
                      text: `Use ${detail.name} in what we are working on. Explain where it fits and update the plan if there is one.`,
                    });
                  }}
                >
                  <Plus />
                  Use this in my goal
                </button>
              </div>
              <details className="pp-source">
                <summary>
                  Behind this connection <ChevronDown />
                </summary>
                {records.length ? (
                  records.map((r) => (
                    <article key={r.id}>
                      <small>
                        {r.delivery || "Supplied"} ·{" "}
                        {new Date(r.at).toLocaleDateString()}
                      </small>
                      <p>{r.summary}</p>
                      {r.limitations.map((l) => (
                        <p key={l}>{l}</p>
                      ))}
                    </article>
                  ))
                ) : (
                  <p>No provider evidence is attached to this reference.</p>
                )}
              </details>
              <details className="pp-source">
                <summary>
                  Before you make plans <ChevronDown />
                </summary>
                <p>
                  Cost:{" "}
                  {detail.cost.value === null
                    ? "Not confirmed"
                    : `${detail.cost.value} USD, ${detail.cost.source.replaceAll("-", " ")}`}
                </p>
                <p>
                  Availability:{" "}
                  {detail.available === null
                    ? "Not confirmed"
                    : detail.available
                      ? "Supplied as available"
                      : "Supplied as unavailable"}
                </p>
                {detail.place?.website && (
                  <a
                    href={detail.place.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Visit the source <ArrowUpRight />
                  </a>
                )}
              </details>
            </div>
          </div>
        )}
        {message && (
          <p className="pp-status" role="status">
            {message}
          </p>
        )}
      </ProductDialog>
      {message && !detail && (
        <p className="pp-status" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
export function ProductCollections({
  task,
  collections,
  isBusy,
  saveOutput,
  onLoad,
}: {
  task: Task;
  collections: SavedCollection[];
  isBusy: boolean;
  saveOutput: SaveOutput;
  onLoad: (id: string) => Promise<boolean>;
}) {
  const [create, setCreate] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [notes, setNotes] = useState(""),
    [chosen, setChosen] = useState<string[]>([]),
    [order, setOrder] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  const board = collections.find((c) => c.id === selected);
  function open(c: SavedCollection) {
    setSelected(c.id);
    setTitle(c.title);
    setNotes(c.notes);
    setOrder(c.items.map((i) => i.id));
    setNotice("");
  }
  function move(i: number, delta: number) {
    setOrder((v) => {
      const a = [...v];
      [a[i], a[i + delta]] = [a[i + delta], a[i]];
      return a;
    });
  }
  return (
    <div className="pp-collections">
      <div className="pp-collection-toolbar">
        <span>
          {collections.length
            ? `${collections.length} collections`
            : "Keep the things you want to come back to."}
        </span>
        <button
          onClick={() => {
            setCreate(true);
            setTitle("");
            setChosen([]);
            setNotice("");
          }}
        >
          <Plus />
          New collection
        </button>
      </div>
      {collections.length ? (
        <div className="pp-board-grid">
          {collections.map((c) => (
            <button className="pp-board" key={c.id} onClick={() => open(c)}>
              <div className="pp-board-covers">
                {c.items.slice(0, 4).map((item) => (
                  <Artwork key={item.id} candidate={item} />
                ))}
              </div>
              <h3>{c.title}</h3>
              <p>
                {c.items.length}{" "}
                {c.items.length === 1 ? "reference" : "references"}
                {c.sourceChanged ? " · Source changed" : ""}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <div className="pp-collection-empty">
          <Bookmark />
          <h2>A place for your good finds.</h2>
          <p>
            Save a reference from a conversation, or bring a few together in a
            collection.
          </p>
        </div>
      )}
      <ProductDialog
        open={create}
        onClose={() => setCreate(false)}
        title="A new collection"
      >
        <form
          className="pp-board-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await saveOutput({
              type: "collection",
              title,
              candidateIds: chosen,
            });
            if (result) setCreate(false);
            else
              setNotice(
                "The collection could not save. Your choices are still here.",
              );
          }}
        >
          <label>
            Give it a name
            <input
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Something worth keeping"
            />
          </label>
          <div className="pp-choice-grid">
            {task.candidates
              .filter((c) => c.freshness === "current")
              .map((c) => (
                <label key={c.id}>
                  <Artwork candidate={c} />
                  <span>
                    <input
                      type="checkbox"
                      checked={chosen.includes(c.id)}
                      onChange={(e) =>
                        setChosen(
                          e.target.checked
                            ? [...chosen, c.id]
                            : chosen.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.name}
                  </span>
                </label>
              ))}
          </div>
          {!task.candidates.some((c) => c.freshness === "current") && (
            <p>Open a conversation with results to choose references.</p>
          )}
          <button
            className="pp-solid"
            disabled={isBusy || !title.trim() || !chosen.length}
          >
            <Save />
            Save collection
          </button>
          {notice && <p role="alert">{notice}</p>}
        </form>
      </ProductDialog>
      <ProductDialog
        open={!!board}
        onClose={() => setSelected(null)}
        title={board?.title || "Your collection"}
      >
        {board && (
          <form
            className="pp-board-editor"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await saveOutput({
                type: "update-collection",
                id: board.id,
                revision: board.revision,
                title,
                notes,
                order,
              });
              setNotice(
                result
                  ? "Your collection is saved."
                  : "Could not save. Keep your edits and try again.",
              );
            }}
          >
            <div className="pp-board-edit-fields">
              <label>
                Collection name
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Your notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={3000}
                  placeholder="What connects these references?"
                />
              </label>
              <button className="pp-solid" disabled={isBusy}>
                <Save />
                Save changes
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (await onLoad(board.taskId)) setSelected(null);
                }}
              >
                <MessageCircle />
                Open conversation
              </button>
              <button
                className="pp-delete"
                type="button"
                disabled={isBusy}
                onClick={async () => {
                  if (window.confirm("Delete this collection?")) {
                    const result = await saveOutput({
                      type: "delete-collection",
                      id: board.id,
                    });
                    if (result) setSelected(null);
                  }
                }}
              >
                <Trash2 />
                Delete collection
              </button>
              {notice && <p role="status">{notice}</p>}
            </div>
            <div className="pp-board-order">
              {order.map((id, i) => {
                const c = board.items.find((x) => x.id === id)!;
                return (
                  <article key={id}>
                    <Artwork candidate={c} />
                    <strong>{c.name}</strong>
                    <div>
                      <button
                        type="button"
                        aria-label={`Move ${c.name} up`}
                        disabled={isBusy || i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${c.name} down`}
                        disabled={isBusy || i === order.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </form>
        )}
      </ProductDialog>
    </div>
  );
}
export function ProductSharing({
  task,
  shares,
  reviews,
  isBusy,
  saveOutput,
  onRefresh,
}: {
  task: Task;
  shares: StoredShare[];
  reviews: StoredReview[];
  isBusy: boolean;
  saveOutput: SaveOutput;
  onRefresh: () => Promise<void>;
}) {
  const [participant, setParticipant] = useState(""),
    [consent, setConsent] = useState(false),
    [link, setLink] = useState("");
  const main = task.artifacts.find((a) => a.id === "main");
  return (
    <section className="pp-share">
      <h3>A second pair of eyes.</h3>
      <p>
        Create a review link for this saved document and its cited evidence. It
        expires in seven days. Anyone with the link can view it.
      </p>
      <details>
        <summary>
          See exactly what you are sharing <ChevronDown />
        </summary>
        <pre>{main?.content}</pre>
        {task.evidence
          .filter((e) => main?.evidenceIds.includes(e.id))
          .map((e) => (
            <p key={e.id}>{e.summary}</p>
          ))}
      </details>
      <label>
        Who is reviewing?
        <select
          value={participant}
          onChange={(e) => setParticipant(e.target.value)}
        >
          <option value="">Comments only</option>
          {task.brief.participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} can propose taste corrections
            </option>
          ))}
        </select>
      </label>
      <label className="pp-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I have reviewed the document and evidence I am sharing.
      </label>
      <button
        className="pp-solid"
        disabled={isBusy || !consent || main?.freshness !== "current"}
        onClick={async () => {
          const r = await saveOutput({
            type: "share",
            artifactIds: ["main"],
            participantId: participant || null,
            expiresInDays: 7,
          });
          if (r) {
            setLink(location.origin + r.path);
            setConsent(false);
          }
        }}
      >
        <Share2 />
        Create review link
      </button>
      {link && (
        <label>
          Your review link
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
          <a href={link} target="_blank" rel="noreferrer">
            Open review <ArrowUpRight />
          </a>
        </label>
      )}
      {shares.map((s) => (
        <div className="pp-share-row" key={s.id}>
          <span>
            {s.revoked
              ? "Link revoked"
              : "Expires " + new Date(s.expiresAt).toLocaleDateString()}
          </span>
          <button
            disabled={isBusy || s.revoked}
            onClick={() => void saveOutput({ type: "revoke", id: s.id })}
          >
            Revoke
          </button>
        </div>
      ))}
      <div className="pp-review-header">
        <h3>Feedback</h3>
        <button disabled={isBusy} onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>
      {!reviews.length && <p>No feedback yet.</p>}
      {reviews.map((r) => (
        <article key={r.id}>
          <p>
            {r.proposal.type === "comment"
              ? r.proposal.text
              : `${r.proposal.value} · ${r.proposal.polarity}`}
          </p>
          <small>From a review link holder</small>
          <button
            disabled={isBusy || r.accepted}
            onClick={() => void saveOutput({ type: "accept-review", id: r.id })}
          >
            {r.accepted ? <Check /> : <Plus />}
            {r.accepted
              ? "Reviewed"
              : r.proposal.type === "comment"
                ? "Acknowledge"
                : "Apply proposed preference"}
          </button>
        </article>
      ))}
    </section>
  );
}
