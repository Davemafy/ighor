"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  Eye,
  FileText,
  History,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  Plus,
  Save,
  Settings2,
  Share2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Task, TaskAction } from "@/core/contracts";
import { TaskCanvas } from "./task-canvas";
import { useWorkspace } from "./use-workspace";
import {
  ProductText,
  ProductComposer,
  ProductDialog,
  ProductResults,
  ProductCollections,
  ProductSharing,
} from "./product-surfaces";
import { useSavedOutcomes } from "./use-saved-outcomes";
import "../app/product.css";
import "../app/canvas.css";

type View = "explore" | "conversations" | "saved" | "conversation" | "editor";
const asset = "/marketing/assets/";
const makingIdeas = [
  {
    title: "A weekend worth getting away for",
    copy: "Travel",
    image: "photos/london-street-800.webp",
    prompt:
      "Help me plan a weekend away. Start by asking where I am travelling from, my budget and what I enjoy.",
  },
  {
    title: "The gift that feels like them",
    copy: "Gifting",
    image: "generated/gift-record-640.webp",
    prompt:
      "Help me choose a thoughtful gift. Ask who it is for, what they like and my budget.",
  },
  {
    title: "A night with your favourite people",
    copy: "Together",
    image: "photos/hero-dinner-a-800.webp",
    prompt:
      "Help me plan an evening with friends. Ask about our city, budget and what everyone enjoys.",
  },
  {
    title: "Give the idea a direction",
    copy: "Creative work",
    image: "photos/gallery-800.webp",
    prompt:
      "Help me develop a creative brief. Start by asking what I am making, who it is for and my references.",
  },
  {
    title: "Find the option that fits",
    copy: "Decisions",
    image: "generated/gift-lamp-640.webp",
    prompt:
      "Help me compare a few options. Ask what I am choosing between and what matters to me.",
  },
  {
    title: "Make room for everyone",
    copy: "Group plans",
    image: "generated/gift-book-640.webp",
    prompt:
      "Help me make a plan for a group with different tastes. Start by asking what we are planning and whose preferences matter.",
  },
];
const startingPoints = makingIdeas.slice(0, 3);

export function Home() {
  const workspace = useWorkspace();
  const [view, setView] = useState<View>("conversation"),
    [prompt, setPrompt] = useState(""),
    [historyError, setHistoryError] = useState(""),
    [help, setHelp] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // The visual viewport is shorter than the layout viewport when a mobile
  // keyboard opens. Keep the task and composer in the visible area.
  useEffect(() => {
    const viewport = window.visualViewport;
    const sync = () => {
      document.documentElement.style.setProperty(
        "--igor-visible-height",
        `${Math.round(viewport?.height ?? window.innerHeight)}px`,
      );
    };
    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.documentElement.style.removeProperty("--igor-visible-height");
    };
  }, []);
  function navigate(next: View, replace = false) {
    setView(next);
    const url = new URL(location.href);
    url.searchParams.set("view", next);
    if (workspace.task) url.searchParams.set("task", workspace.task.id);
    history[replace ? "replaceState" : "pushState"]({}, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    const read = () => {
      const v = new URL(location.href).searchParams.get("view");
      if (
        [
          "explore",
          "conversations",
          "saved",
          "conversation",
          "editor",
        ].includes(v || "")
      )
        setView(v as View);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    void workspace
      .loadHistory()
      .catch(() =>
        setHistoryError("Your conversations could not load. Try again."),
      );
  }, []);
  const restored = useRef(false);
  useEffect(() => {
    if (!workspace.task || restored.current) return;
    restored.current = true;
    const id = new URL(location.href).searchParams.get("task");
    if (id && id !== workspace.task.id)
      void workspace
        .openWorkspace(id)
        .catch(() =>
          workspace.setErrorMessage("This conversation could not be restored."),
        );
  }, [workspace.task]);
  async function begin(action: TaskAction) {
    if (!workspace.task || workspace.isBusy) return;
    if (action.type === "message") {
      navigate("conversation");
      setPrompt("");
    }
    await workspace.sendTurn(action);
    void workspace.loadHistory().catch(() => {});
  }
  async function startIdea(text: string) {
    if (workspace.isBusy) return;
    setView("conversation");
    setPrompt("");
    const task = await workspace.createWorkspace();
    if (task) {
      const url = new URL(location.href);
      url.searchParams.set("view", "conversation");
      url.searchParams.set("task", task.id);
      history.pushState({}, "", url);
      await workspace.sendTurn({ type: "message", text }, task);
      void workspace.loadHistory().catch(() => {});
    }
  }
  async function resume(id: string) {
    try {
      if (await workspace.openWorkspace(id)) {
        setView("conversation");
        const url = new URL(location.href);
        url.searchParams.set("task", id);
        url.searchParams.set("view", "conversation");
        history.pushState({}, "", url);
        window.scrollTo({ top: 0, behavior: "instant" });
      } else setHistoryError("That conversation is no longer available.");
    } catch {
      setHistoryError("This conversation could not open. Please try again.");
    }
  }
  async function fresh() {
    await workspace.createWorkspace();
    setPrompt("");
    setView("conversation");
    const url = new URL(location.href);
    url.searchParams.set("view", "conversation");
    url.searchParams.delete("task");
    history.pushState({}, "", url);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  const tabs = [
    { view: "explore" as View, label: "Explore", Icon: Compass },
    {
      view: "conversations" as View,
      label: "Conversations",
      Icon: MessageCircle,
    },
    { view: "saved" as View, label: "Saved", Icon: Bookmark },
  ];
  const currentTitle =
    view === "conversation"
      ? "Your conversation"
      : view === "editor"
        ? "Your work"
        : view === "conversations"
          ? "Conversations"
          : view === "saved"
            ? "Saved"
            : "Explore";
  const currentWork =
    workspace.task?.artifacts.filter((a) => a.freshness === "current") || [];
  const conversationTitle =
    workspace.task?.brief.goal ||
    workspace.task?.messages.find((m) => m.role === "user")?.text;
  const headerTitle =
    view === "conversation" || view === "editor"
      ? conversationTitle || "New conversation"
      : currentTitle;
  return (
    <div className={`ig-app ip-app ip-view-${view}`}>
      <a className="ip-skip" href="#igor-main">
        Skip to content
      </a>
      <aside className="ip-rail">
        <a className="ip-mark" href="/" aria-label="Igor homepage">
          <img
            src={asset + "brand/igor-mark-white.svg"}
            alt=""
            width="30"
            height="30"
          />
        </a>
        <nav aria-label="Product navigation">
          {tabs.map(({ view: v, label, Icon }) => (
            <button
              key={v}
              className={
                view === v ||
                (v === "conversations" &&
                  (view === "conversation" || view === "editor"))
                  ? "active"
                  : ""
              }
              aria-label={label}
              aria-current={view === v ? "page" : undefined}
              onClick={() => navigate(v)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
          <button
            onClick={() => void fresh()}
            disabled={workspace.isBusy}
            aria-label="New goal"
          >
            <Plus />
            <span>New goal</span>
          </button>
        </nav>
        <button
          className="ip-help"
          onClick={() => setHelp(true)}
          aria-label="About this space"
        >
          <Settings2 />
          <span>About</span>
        </button>
      </aside>
      <div className="ip-body">
        <header className="ip-topbar">
          {(view === "conversation" || view === "editor") && (
            <button
              className="ip-mobile-back"
              aria-label="Back to conversations"
              onClick={() => navigate("conversations")}
            >
              <ArrowLeft />
            </button>
          )}
          <a href="/app" className="ip-wordmark" aria-label="Igor home">
            igor
            <span className="ip-brand-dot" />
          </a>
          <div className="ip-header-context">
            <span className="ip-header-label">
              {view === "editor"
                ? "Your work"
                : view === "conversation"
                  ? "Conversation"
                  : "Your space"}
            </span>
            <span className="ip-header-title" title={headerTitle}>
              {headerTitle}
            </span>
          </div>
          <div className="ip-header-actions">
            {workspace.isBusy && (
              <span className="ip-working" role="status">
                <LoaderCircle className="ig-spin" />
                Igor is working
              </span>
            )}
            {(view === "conversation" || view === "editor") && (
              <button
                className="ip-work-button"
                aria-label={
                  view === "editor"
                    ? "Return to conversation"
                    : "Open your work"
                }
                onClick={() =>
                  navigate(view === "editor" ? "conversation" : "editor")
                }
                disabled={
                  view !== "editor" &&
                  !currentWork.length &&
                  !workspace.task?.canvas
                }
                title={
                  view === "editor"
                    ? "Return to your conversation"
                    : currentWork.length
                      ? "Open your plans and drafts"
                      : "Your plans and drafts will appear here"
                }
              >
                {view === "editor" ? <MessageCircle /> : <FileText />}
                <span>{view === "editor" ? "Conversation" : "Your work"}</span>
                {view !== "editor" && currentWork.length > 0 && (
                  <span className="ip-work-count">{currentWork.length}</span>
                )}
              </button>
            )}
            <button
              className="ip-pill"
              aria-label="New goal"
              onClick={() => void fresh()}
              disabled={workspace.isBusy}
            >
              <Plus />
              <span>New goal</span>
            </button>
          </div>
        </header>
        <main id="igor-main">
          {view === "explore" && (
            <>
              <section className="ip-explore-hero">
                <img
                  src={asset + "photos/hero-dinner-a-1200.webp"}
                  alt="Friends making an evening together"
                />
                <div className="ip-hero-shade" />
                <div className="ip-hero-content">
                  <h1>
                    <span>explore</span> <span>with igor</span>
                  </h1>
                </div>
              </section>
              <div className="ip-explore-content">
                <CardRow title="A good place to start" description="">
                  {startingPoints.map((item) => (
                    <button
                      className="ip-feature-card"
                      key={item.title}
                      disabled={workspace.isBusy || !workspace.task}
                      onClick={() => void startIdea(item.prompt)}
                    >
                      <img src={asset + item.image} alt="" />
                      <div>
                        <small>{item.copy}</small>
                        <h3>{item.title}</h3>
                        <span>
                          Make it yours
                          <ArrowUpRight />
                        </span>
                      </div>
                    </button>
                  ))}
                </CardRow>
                <CardRow title="What will you make of it?" description="">
                  {makingIdeas.map((item) => (
                    <button
                      className="ip-story-card"
                      key={item.title}
                      disabled={workspace.isBusy || !workspace.task}
                      onClick={() => void startIdea(item.prompt)}
                    >
                      <div className="ip-card-image">
                        <img src={asset + item.image} alt="" />
                        <span>
                          <ArrowUpRight />
                        </span>
                      </div>
                      <small>{item.copy}</small>
                      <h3>{item.title}</h3>
                    </button>
                  ))}
                </CardRow>
                {workspace.history.length > 0 && (
                  <section className="ip-continue">
                    <div className="ip-section-heading">
                      <div>
                        <h2>Pick up the thread</h2>
                        <p>Your conversations, right where you left them.</p>
                      </div>
                      <button onClick={() => navigate("conversations")}>
                        View all <ArrowRight />
                      </button>
                    </div>
                    <div className="ip-history-grid">
                      {workspace.history.slice(0, 3).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => void resume(item.id)}
                        >
                          <MessageCircle />
                          <h3>
                            {item.title || item.goal || "A new conversation"}
                          </h3>
                          <span>
                            Continue <ArrowUpRight />
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
          {view === "conversations" && (
            <section className="ip-page">
              <div className="ip-page-heading">
                <span>KEEP THE THREAD</span>
                <h1>Your conversations.</h1>
                <p>Good ideas are worth coming back to.</p>
              </div>
              {historyError && (
                <p role="alert" className="ip-error">
                  {historyError}
                  <button
                    onClick={() =>
                      void workspace
                        .loadHistory()
                        .then(() => setHistoryError(""))
                        .catch(() => setHistoryError("Please try again."))
                    }
                  >
                    Retry
                  </button>
                </p>
              )}
              {workspace.history.length ? (
                <div className="ip-conversation-list">
                  {workspace.history.map((item) => (
                    <button key={item.id} onClick={() => void resume(item.id)}>
                      <span className="ip-list-icon">
                        <MessageCircle />
                      </span>
                      <strong>
                        {item.title || item.goal || "A new conversation"}
                      </strong>
                      <ArrowUpRight />
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={<MessageCircle />}
                  title="Your next idea starts here."
                  text="Conversations will appear here once you begin."
                  action={() => void fresh()}
                  label="Start a conversation"
                />
              )}
            </section>
          )}
          {view === "saved" && workspace.task && (
            <ProductSaved
              task={workspace.task}
              onTask={workspace.acceptTask}
              onTurn={workspace.sendTurn}
              onLoad={async (id) => {
                await resume(id);
                return true;
              }}
            />
          )}
          {view === "conversation" && (
            <section className="ip-conversation">
              {workspace.task &&
              (workspace.task.messages.length > 0 ||
                workspace.task.brief.goal ||
                workspace.feedback) ? (
                <ProductResults
                  task={workspace.task}
                  busy={workspace.isBusy}
                  feedback={workspace.feedback}
                  onTurn={(a) => void begin(a)}
                  onWork={() => navigate("editor")}
                />
              ) : (
                <div className="ip-conversation-empty">
                  <img
                    src={asset + "brand/igor-mark-white.svg"}
                    width="42"
                    height="42"
                    alt=""
                  />
                  <h1>What are we making?</h1>
                  <p>Research a decision. Shape an idea. Make a plan.</p>
                  <div className="ip-starter-grid">
                    {makingIdeas.slice(0, 4).map((item) => (
                      <button
                        key={item.title}
                        disabled={workspace.isBusy || !workspace.task}
                        onClick={() =>
                          void begin({ type: "message", text: item.prompt })
                        }
                      >
                        <img src={asset + item.image} alt="" />
                        <span>
                          <small>{item.copy}</small>
                          {item.title}
                        </span>
                        <ArrowUpRight />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="ip-conversation-composer">
                <ProductComposer
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={() =>
                    void begin({ type: "message", text: prompt.trim() })
                  }
                  inputRef={inputRef}
                  disabled={workspace.isBusy || !workspace.task}
                  busy={workspace.isBusy}
                  compact
                  continuing={!!workspace.task?.messages.length}
                />
              </div>
            </section>
          )}
          {view === "editor" && workspace.task?.canvas && (
            <section className="ip-conversation">
              {workspace.errorMessage && (
                <p role="alert" className="ip-error">
                  {workspace.errorMessage} Your draft is still here. Save again
                  to retry.
                </p>
              )}
              <TaskCanvas
                task={workspace.task}
                busy={workspace.isBusy}
                onTurn={(a) => void begin(a)}
              />
              <div className="ip-conversation-composer">
                <ProductComposer
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={() =>
                    void begin({ type: "message", text: prompt.trim() })
                  }
                  inputRef={inputRef}
                  disabled={workspace.isBusy}
                  busy={workspace.isBusy}
                  continuing
                />
              </div>
            </section>
          )}
          {view === "editor" && workspace.task && !workspace.task.canvas && (
            <ProductEditor
              key={workspace.task.id}
              task={workspace.task}
              busy={workspace.isBusy}
              error={workspace.errorMessage}
              onTurn={workspace.sendTurn}
              onTask={workspace.acceptTask}
              onBack={() => navigate("conversation")}
            />
          )}
          {workspace.errorMessage &&
            view !== "editor" &&
            workspace.feedback?.state !== "error" && (
              <div className="ip-error" role="alert">
                {workspace.errorMessage}
                <button
                  disabled={workspace.isBusy}
                  onClick={() => void workspace.createWorkspace()}
                >
                  Start a fresh space
                </button>
              </div>
            )}
          {!workspace.task && !workspace.errorMessage && (
            <p className="ip-session" role="status">
              <LoaderCircle className="ig-spin" />
              Opening your space
            </p>
          )}
        </main>
      </div>
      <ProductDialog
        open={help}
        onClose={() => setHelp(false)}
        title="Your space with Igor"
      >
        <p>
          Bring a goal, work through it with Igor and keep the result. Your
          conversations and saved collections belong to this session.
        </p>
        <p>
          Qloo supplies cultural associations. Practical details still need
          checking. Each result lets you inspect its source.
        </p>
      </ProductDialog>
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  label,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: () => void;
  label: string;
}) {
  return (
    <div className="ip-empty">
      {icon}
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="ip-primary" onClick={action}>
        {label}
        <ArrowRight />
      </button>
    </div>
  );
}
function CardRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <section className="ip-card-row">
      <div className="ip-section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="ip-row-controls">
          <button
            aria-label={`Previous ${title.toLowerCase()}`}
            onClick={() =>
              ref.current?.scrollBy({ left: -340, behavior: "smooth" })
            }
          >
            <ChevronLeft />
          </button>
          <button
            aria-label={`More ${title.toLowerCase()}`}
            onClick={() =>
              ref.current?.scrollBy({ left: 340, behavior: "smooth" })
            }
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className="ip-card-track" ref={ref}>
        {children}
      </div>
    </section>
  );
}
function ProductSaved({
  task,
  onTask,
  onTurn,
  onLoad,
}: {
  task: Task;
  onTask: (t: Task) => void;
  onTurn: (a: TaskAction) => Promise<void>;
  onLoad: (id: string) => Promise<boolean>;
}) {
  const saved = useSavedOutcomes(task, onTask, onTurn);
  return (
    <section className="ip-page ip-saved">
      <div className="ip-page-heading">
        <span>KEEP WHAT MATTERS</span>
        <h1>Saved inspiration.</h1>
        <p>Your references, collected in one place.</p>
      </div>
      {saved.errorMessage && (
        <p role="alert" className="ip-error">
          {saved.errorMessage}
        </p>
      )}
      {saved.statusMessage && <p role="status">{saved.statusMessage}</p>}
      <ProductCollections
        task={task}
        collections={saved.data.collections}
        isBusy={saved.isBusy}
        saveOutput={saved.saveOutput}
        onLoad={onLoad}
      />
    </section>
  );
}
function ProductEditor({
  task,
  busy,
  error,
  onTurn,
  onTask,
  onBack,
}: {
  task: Task;
  busy: boolean;
  error: string;
  onTurn: (a: TaskAction) => Promise<void>;
  onTask: (t: Task) => void;
  onBack: () => void;
}) {
  const artifacts = task.artifacts.filter(
    (a) => a.freshness === "current" || busy,
  );
  const [selected, setSelected] = useState(artifacts[0]?.id || ""),
    [draft, setDraft] = useState(artifacts[0]?.content || ""),
    [mode, setMode] = useState<"edit" | "preview" | "share">("edit"),
    [tone, setTone] = useState("paper"),
    [serif, setSerif] = useState(false),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  const artifact = artifacts.find((a) => a.id === selected) || artifacts[0];
  const dirty = !!artifact && draft !== artifact.content;
  const saved = useSavedOutcomes(task, onTask, onTurn);
  useEffect(() => {
    if (artifact && selected !== artifact.id) {
      setSelected(artifact.id);
      setDraft(artifact.content);
    }
  }, [artifact?.id, selected]);
  useEffect(() => {
    if (artifact && artifact.content === draft && saving) {
      setSaving(false);
      setNotice("Your draft is saved.");
    }
  }, [artifact?.content, draft, saving]);
  async function save() {
    if (!artifact || busy) return;
    setSaving(true);
    setNotice("");
    await onTurn({ type: "artifact", artifactId: artifact.id, content: draft });
    setSaving(false);
  }
  function choose(id: string) {
    if (
      dirty &&
      !window.confirm("Discard your unsaved edits and open another draft?")
    )
      return;
    const a = artifacts.find((x) => x.id === id);
    if (a) {
      setSelected(a.id);
      setDraft(a.content);
      setNotice("");
    }
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  if (!artifact)
    return (
      <section className="ip-page">
        <Empty
          icon={<FileText />}
          title="Give your idea a little shape."
          text="Ask Igor to create a plan, brief or draft in your conversation. Your editable work will appear here."
          action={onBack}
          label="Back to the conversation"
        />
      </section>
    );
  return (
    <section className={`ip-editor ip-tone-${tone} ip-mode-${mode}`}>
      <div className="ip-editor-top">
        <button
          onClick={() => {
            if (!dirty || window.confirm("Leave without saving your edits?"))
              onBack();
          }}
        >
          <ArrowLeft />
          Conversation
        </button>
        <span>
          {dirty
            ? "Unsaved changes"
            : artifact.edited
              ? "Your saved draft"
              : "A draft to make your own"}
        </span>
        <button
          className="ip-primary"
          disabled={busy || saving || !dirty || !draft.trim()}
          onClick={() => void save()}
        >
          {saving ? <LoaderCircle className="ig-spin" /> : <Save />}
          {saving ? "Saving" : "Save draft"}
        </button>
      </div>
      <div className="ip-editor-layout">
        <div className="ip-edit-fields">
          <span className="ip-kicker">MAKE IT YOURS</span>
          <h1>{artifact.title}</h1>
          <div className="ip-artifact-tabs">
            {artifacts.map((a) => (
              <button
                aria-pressed={a.id === artifact.id}
                key={a.id}
                onClick={() => choose(a.id)}
              >
                {a.title}
              </button>
            ))}
          </div>
          {mode === "share" ? (
            <div className="ip-sharing">
              <ProductSharing
                task={task}
                shares={saved.data.shares}
                reviews={saved.data.reviews}
                isBusy={busy || saved.isBusy}
                saveOutput={saved.saveOutput}
                onRefresh={saved.refresh}
              />
            </div>
          ) : (
            <>
              <label htmlFor="ip-draft">Your words</label>
              <textarea
                id="ip-draft"
                maxLength={10000}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setNotice("");
                }}
              />
              <p>Changes appear in the preview as you type.</p>
            </>
          )}
          {(error || saved.errorMessage) && (
            <p role="alert" className="ip-error">
              {error || saved.errorMessage}
            </p>
          )}
          {(notice || saved.statusMessage) && (
            <p role="status">{notice || saved.statusMessage}</p>
          )}
        </div>
        <div className="ip-preview-area">
          <div className="ip-preview-caption">
            <span>Preview</span>
            <span>{dirty ? "Editing" : "Saved draft"}</span>
          </div>
          <article className={`ip-paper ${serif ? "ip-serif" : ""}`}>
            <small>MADE WITH IGOR</small>
            <h2>{artifact.title}</h2>
            <div>
              <ProductText text={draft} />
            </div>
          </article>
          <p className="ip-preview-note">
            {artifact.assumptions.length > 0
              ? "Review the assumptions and practical details before sharing."
              : "Your words, ready for a closer look."}
          </p>
        </div>
        <nav className="ip-editor-tools" aria-label="Draft tools">
          <button
            aria-pressed={mode === "edit"}
            onClick={() => setMode("edit")}
          >
            <FileText />
            <span>Edit</span>
          </button>
          <button
            aria-pressed={tone === "rose"}
            onClick={() => setTone(tone === "paper" ? "rose" : "paper")}
          >
            <ImageIcon />
            <span>Theme</span>
          </button>
          <button aria-pressed={serif} onClick={() => setSerif(!serif)}>
            <Settings2 />
            <span>Type</span>
          </button>
          <button
            aria-pressed={mode === "preview"}
            onClick={() => setMode(mode === "preview" ? "edit" : "preview")}
          >
            <Eye />
            <span>Preview</span>
          </button>
          <button
            aria-pressed={mode === "share"}
            disabled={dirty || artifact.id !== "main"}
            title={
              dirty
                ? "Save your draft before sharing"
                : artifact.id !== "main"
                  ? "Open your main document to share it"
                  : "Share your saved working document"
            }
            onClick={() => setMode("share")}
          >
            <Share2 />
            <span>Share</span>
          </button>
          <a
            href={`/api/tasks/${task.id}/export?format=markdown&version=${task.brief.version}`}
            download
            aria-label="Export saved draft"
          >
            <Download />
            <span>Export</span>
          </a>
        </nav>
      </div>
    </section>
  );
}
