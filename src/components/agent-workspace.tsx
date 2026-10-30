"use client";

import Link from "next/link";
import { Compass, FilePlus2, Map, Home as HomeIcon, UserRound } from "lucide-react";
import { AccountDialog } from "./account-panel";
import { Connections } from "./connections-view";
import { ReferenceWork } from "./reference-work";
import { DecisionWork } from "./decision-work";
import { InvitationStudio } from "./invitation-studio";
import { projectInvitationScene } from "@/core/invitation-scene";
import { AppearanceControl } from "./appearance-control";
import { AdaptiveStage } from "./adaptive-stage";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  ChevronDown,
  FileText,
  LoaderCircle,
  Menu,
  MessageCircle,
  Compose,
  Save,
  Search,
  Share2,
  X,
} from "./workspace-icons";
import type { Artifact, Task, TaskAction } from "@/core/contracts";
import { useWorkspace } from "./use-workspace";
import {
  LoadingSurface,
  AgentActivity,
  LoadingImage,
} from "./workspace-loading";
import { morphLayout } from "./mobile-transitions";
import { hasPendingInput } from "./turn-feedback";
import { TaskCanvas } from "./task-canvas";
import { ConnectedWorkCanvas } from "./connected-work-canvas";
import { ResearchDiscovery, buildResearchCards } from "./research-discovery";
import {
  ProductText,
  ProductCollections,
  ProductSharing,
} from "./product-surfaces";
import { useSavedOutcomes } from "./use-saved-outcomes";
import "../app/product.css";
import "../app/canvas.css";
import "../app/connected-work.css";
import "../app/revision-impact.css";
import "../app/spatial-morph.css";
import "../app/workbench.css";
import "../app/native-workspace.css";
import "../app/mockup-native.css";
import "../app/research-discovery.css";
import "../app/reference-work.css";

const assets = "/marketing/assets/";
const starts = [
  {
    title: "A thoughtful gift",
    caption: "A little more them.",
    image: "covers/c01.webp",
    prompt:
      "Help me find a thoughtful gift. Ask who it is for and what matters before suggesting anything.",
  },
  {
    title: "Something together",
    caption: "Room for everyone.",
    image: "covers/c02.webp",
    prompt:
      "Plan something great with friends. Use the details I provide to explore real options, show a sourced shortlist, and save a usable plan. Ask only for essential missing information.",
  },
  {
    title: "A new direction",
    caption: "Give the idea a shape.",
    image: "covers/c03.webp",
    prompt:
      "Help me develop a creative idea. Ask what I am making and who it is for.",
  },
  {
    title: "A few days away",
    caption: "Somewhere worth going.",
    image: "covers/c04.webp",
    prompt:
      "Help me plan a short trip. Start with where I am leaving from, my dates and budget.",
  },
];
type Page = "work" | "history" | "saved" | "explore" | "maps" | "create";

export function AgentWorkspace({
  initialPage = "work",
  initialConversation = false,
  initialHasResult = false,
}: {
  initialPage?: Page;
  initialConversation?: boolean;
  initialHasResult?: boolean;
  initialPane?: "thread" | "work";
}) {
  const w = useWorkspace();
  const [accountOpen, setAccountOpen] = useState(false);
  const [page, setPage] = useState<Page>(initialPage);
  const [prompt, setPrompt] = useState("");
  const [menu, setMenu] = useState(false);
  const [exploreView, setExploreView] = useState<"discover" | "compare" | "plan" | "detail" | "revisions" | "maps">("discover");
  const [historyError, setHistoryError] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLElement>(null);
  const presentedResult = useRef("");
  const scrolledTask = useRef<string | null>(null);
  const task = w.task;
  const hasResult = !task
    ? initialHasResult
    : !!(
        task?.canvas?.surface.nodes.some(
          (node) =>
            !["stack", "tabs", "columns", "activity", "question"].includes(
              node.type,
            ),
        ) ||
        task?.work?.documents.length ||
        task?.work?.decisions.length ||
        task?.artifacts.length ||
        task?.candidates.length
      );
  const started = task
    ? !!(task.messages.length || w.feedback)
    : initialConversation;
  const resultIdentity = task
    ? `${task.id}:${task.canvas?.surface.id ?? ""}:${task.work?.documents.length ?? 0}:${task.artifacts.length}`
    : "";
  const questions =
    task?.canvas?.surface.nodes.filter((node) => node.type === "question") ??
    [];
  const matchingHistory = w.history
    .filter((item) =>
      `${conversationTitle(item.title || item.goal)} ${item.preview || ""}`
        .toLocaleLowerCase()
        .includes(historySearch.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => {
      const left = Date.parse(a.updatedAt || "");
      const right = Date.parse(b.updatedAt || "");

      return Number.isFinite(left) && Number.isFinite(right) ? right - left : 0;
    });
  const title = task?.brief.goal || "Your conversation";

  useEffect(() => {
    if (!task || w.isLoadingWorkspace) {
      return;
    }

    document.cookie = `igor-layout=${started ? "conversation" : "welcome"}:${hasResult ? "result" : "plain"}; Path=/app; SameSite=Lax; Max-Age=2592000`;
  }, [task?.id, started, hasResult, w.isLoadingWorkspace]);
  useEffect(() => {
    void w
      .loadHistory()
      .catch(() => setHistoryError("Conversations could not load. Try again."))
      .finally(() => setHistoryLoading(false));
  }, []);
  useEffect(() => {
    const region = end.current?.closest(".iw-messages");

    if (
      region &&
      (scrolledTask.current !== task?.id ||
        region.scrollHeight - region.scrollTop - region.clientHeight < 180)
    ) {
      region.scrollTop = region.scrollHeight;
      scrolledTask.current = task?.id ?? null;
    }
  }, [task?.id, task?.messages.length, w.isBusy, w.isLoadingWorkspace]);
  // Show newly produced work once, rather than leaving it hidden below
  // the fold. Subsequent conversation turns do not steal scrolling focus.
  useEffect(() => {
    if (
      !hasResult ||
      !resultIdentity ||
      w.isBusy ||
      w.isLoadingWorkspace ||
      presentedResult.current === resultIdentity
    ) {
      return;
    }

    presentedResult.current = resultIdentity;
    const frame = requestAnimationFrame(() => {
      // The work is already visible beside conversation on desktop.
      if (window.matchMedia("(min-width: 1024px)").matches) return;
      outputRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [hasResult, resultIdentity, w.isBusy, w.isLoadingWorkspace]);

  useEffect(() => {
    const area = input.current;

    if (area) {
      area.style.height = "auto";
      area.style.height = `${Math.min(area.scrollHeight, 144)}px`;
    }
  }, [prompt, started, page]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () =>
      document.documentElement.style.setProperty(
        "--iw-height",
        `${viewport?.height ?? innerHeight}px`,
      );

    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);

    return () => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      document.documentElement.style.removeProperty("--iw-height");
    };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu) {
        setMenu(false);
        menuTrigger.current?.focus();
      }
    };

    window.addEventListener("keydown", escape);

    return () => window.removeEventListener("keydown", escape);
  }, [menu]);

  function canLeave() {
    const check = new Event("beforeunload", { cancelable: true });

    return (
      window.dispatchEvent(check) ||
      window.confirm("Leave with unsaved edits? Keep a copy before continuing.")
    );
  }

  function navigate(next: Page) {
    if (page === "work" && next !== "work" && !canLeave()) {
      return;
    }

    setPage(next);
    setMenu(false);
    const url = new URL(location.href);
    url.searchParams.set(
      "view",
      next === "work"
        ? "conversation"
        : next === "history"
          ? "conversations"
          : next === "saved"
            ? "saved"
            : next,
    );
    history.replaceState({}, "", url);
  }

  async function open(id: string) {
    if (w.isBusy || w.isLoadingWorkspace || !canLeave()) {
      return;
    }

    try {
      if (await w.openWorkspace(id)) {
        navigate("work");
        const url = new URL(location.href);
        url.searchParams.set("task", id);
        history.replaceState({}, "", url);
      }
    } catch {
      w.setErrorMessage("This conversation could not open. Try again.");
    }
  }

  async function fresh() {
    if (w.isBusy || w.isLoadingWorkspace || !canLeave()) {
      return;
    }

    const next = await w.createWorkspace();

    if (!next) {
      return;
    }

    setPrompt("");
    navigate("work");
    const url = new URL(location.href);
    url.searchParams.delete("task");
    history.replaceState({}, "", url);
    requestAnimationFrame(() => input.current?.focus());
  }

  async function turn(action: TaskAction) {
    if (!task || w.isBusy || w.isLoadingWorkspace) {
      return;
    }

    if (action.type === "message") {
      setPrompt("");
      navigate("work");
    }

    await w.sendTurn(action);
    void w.loadHistory().catch(() => {});
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();

    if (prompt.trim() && task && !w.isBusy && !w.isLoadingWorkspace) {
      void turn({ type: "message", text: prompt.trim() });
    }
  }

  const composer = (
    <form
      className="iw-composer"
      onSubmit={submit}
      data-busy={w.isBusy || w.isLoadingWorkspace}
    >
      <label className="iw-sr" htmlFor="iw-message">
        Message Igor
      </label>
      <textarea
        id="iw-message"
        ref={input}
        rows={1}
        value={prompt}
        maxLength={3000}
        placeholder={
          started ? "Keep the thought going…" : "Bring an idea. Start anywhere."
        }
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.nativeEvent.isComposing &&
            !matchMedia("(pointer: coarse)").matches
          ) {
            submit(e);
          }
        }}
      />
      <button
        type="submit"
        aria-label="Send message"
        disabled={!task || w.isBusy || w.isLoadingWorkspace || !prompt.trim()}
      >
        {w.isBusy ? <LoaderCircle className="ig-spin" /> : <ArrowRight />}
      </button>
    </form>
  );

  return (
    <div className={`iw-app igor-mockup ${started && page === "work" ? "iw-active" : ""}`}>
      <AppearanceControl />
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
      <a className="iw-skip" href="#iw-main">
        Skip to content
      </a>
      <header className="iw-nav">
        <Link className="iw-brand" href="/" aria-label="Igor homepage">
          <img
            src={assets + "brand/igor-mark-black.svg"}
            width="29"
            height="29"
            alt=""
          />
          <span>igor</span>
        </Link>
        <nav aria-label="Product navigation">
          <button
            aria-current={page === "work" ? "page" : undefined}
            onClick={() => navigate("work")}
          >
            <HomeIcon />
            <span>Home</span>
          </button>
          <button aria-current={page === "explore" ? "page" : undefined}
            onClick={() => { setExploreView("discover"); navigate("explore"); }}>
            <Compass />
            <span>Explore</span>
          </button>
          <button aria-current={page === "create" ? "page" : undefined}
            onClick={() => navigate("create")}>
            <FilePlus2 />
            <span>Create</span>
          </button>
          <button aria-current={page === "maps" ? "page" : undefined}
            onClick={() => { setExploreView("maps"); navigate("maps"); }}>
            <Map />
            <span>Maps</span>
          </button>
          <button
            aria-current={page === "history" ? "page" : undefined}
            onClick={() => navigate("history")}
          >
            <Search />
            <span>Search</span>
          </button>
          <button
            aria-current={page === "saved" ? "page" : undefined}
            onClick={() => navigate("saved")}
          >
            <Bookmark />
            <span>Library</span>
          </button>
        </nav>
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          aria-label="Account"
          title="Account"
          className="iw-account"
        >
          <UserRound aria-hidden="true" size={22} strokeWidth={1.8} />
        </button>
        <button
          className="iw-new"
          aria-label="New conversation"
          title="New conversation"
          onClick={() => void fresh()}
          disabled={w.isBusy || w.isLoadingWorkspace}
        >
          <Compose />
          <span>New conversation</span>
        </button>
        <button
          ref={menuTrigger}
          className="iw-menu-toggle"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
          aria-controls="iw-menu"
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
        {menu && (
          <div id="iw-menu" className="iw-menu">
            <button onClick={() => navigate("work")}>
              <MessageCircle />
              Your space
            </button>
            <button onClick={() => { setExploreView("discover");navigate("explore"); }}>
              <Compass /> Explore
            </button>
            <button onClick={() => navigate("create")}>
              <FilePlus2 /> Create
            </button>
            <button onClick={() => { setExploreView("maps");navigate("maps"); }}>
              <Map /> Maps
            </button>
            <button onClick={() => navigate("history")}>
              <Search />
              Conversations
            </button>
            <button onClick={() => navigate("saved")}>
              <Bookmark />
              Saved
            </button>
          </div>
        )}
      </header>
      <main id="iw-main">
        {page === "work" && !started && (
          <section className="iw-welcome">
            <div className="iw-intro">
              <h1>
                Your agent.
                <br />
                With taste.
              </h1>
              <p>
                Discover, decide and create.
                <br />
                From a thought to something real.
              </p>
            </div>
            <div className="iw-welcome-compose">{composer}</div>
            <div className="iw-ideas" aria-label="Ways to begin">
              {starts.map((s, i) => (
                <button
                  key={s.title}
                  disabled={!task || w.isBusy}
                  onClick={() => {
                    setPrompt(s.prompt);
                    input.current?.focus();
                  }}
                >
                  <div className="iw-poster">
                    <LoadingImage src={assets + s.image} />
                    <span className="iw-poster-number">0{i + 1}</span>
                  </div>
                  <div>
                    <h2>{s.title}</h2>
                    <ArrowUpRight />
                  </div>
                  <p>{s.caption}</p>
                </button>
              ))}
            </div>
          </section>
        )}
        {page === "work" && started && (
          <section
            className={`iw-workspace iw-inline-workspace ${hasResult ? "iw-with-result" : ""}`}
            aria-busy={w.isLoadingWorkspace}
          >
            <header className="iw-workbar">
              <button
                className="iw-back"
                aria-label="Back to conversations"
                onClick={() => navigate("history")}
              >
                <ArrowLeft />
              </button>
              <div>
                <h1 title={title}>
                  {task ? (
                    title
                  ) : (
                    <i className="iw-skeleton iw-title-placeholder" />
                  )}
                </h1>
              </div>
              <span className="iw-workbar-status">
                {w.isBusy || w.isLoadingWorkspace ? (
                  <>
                    <LoaderCircle className="ig-spin" />
                    {w.isLoadingWorkspace ? "Opening" : "Working"}
                  </>
                ) : (
                  ""
                )}
              </span>
            </header>
            <div className="iw-workgrid">
              <section
                className="iw-thread"
                style={{ viewTransitionName: "igor-conversation" }}
                id="iw-thread"
                aria-label="Conversation"
              >
                <div
                  className="iw-messages"
                  aria-busy={w.isBusy || w.isLoadingWorkspace}
                >
                  <div className="iw-message-stream">
                    {!task && <LoadingSurface mode="thread" />}
                    {task?.messages.map((m, i) => (
                      <article
                        className={`iw-message iw-${m.role}`}
                        key={m.id || `${m.at}:${i}`}
                      >
                        <span className="iw-author">
                          {m.role === "assistant" ? (
                            <img
                              src={assets + "brand/igor-mark-black.svg"}
                              alt="Igor"
                              width="24"
                              height="24"
                            />
                          ) : (
                            "You"
                          )}
                        </span>
                        {m.role === "assistant" &&
                        !!m.evidenceIds?.length &&
                        task?.artifacts.some(
                          (artifact) =>
                            artifact.kind === "research-report" &&
                            m.evidenceIds?.some((id) =>
                              artifact.evidenceIds.includes(id),
                            ),
                        ) ? (
                          <p className="ird-chat-receipt">
                            Your references are ready in Your work. Open a card
                            for a closer look, or build on a direction you like.
                          </p>
                        ) : (
                          <ProductText text={m.text} />
                        )}
                        {m.role === "assistant" && !!m.evidenceIds?.length && (
                          <details className="iw-message-sources">
                            <summary>Sources · {m.evidenceIds.length}</summary>
                            <ul>
                              {m.evidenceIds.map((id) => {
                                const source = task?.evidence.find(
                                  (item) => item.id === id,
                                );

                                if (!source) {
                                  return (
                                    <li key={id}>Source unavailable · {id}</li>
                                  );
                                }

                                const label =
                                  source.kind === "practical" &&
                                  source.source === "provider-returned"
                                    ? "Web"
                                    : source.kind === "cultural"
                                      ? "Qloo"
                                      : "Context";

                                return (
                                  <li key={id}>
                                    <span>{label}</span>
                                    {source.kind === "practical" &&
                                    source.source === "provider-returned" &&
                                    source.reference.startsWith("https://") ? (
                                      <a
                                        href={source.reference}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {source.summary.split(":")[0]}
                                        <ArrowUpRight />
                                      </a>
                                    ) : (
                                      <span>
                                        {source.summary.slice(0, 130)}
                                      </span>
                                    )}
                                    {!!source.limitations.length && (
                                      <small>
                                        {source.limitations.join(" ")}
                                      </small>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </details>
                        )}
                      </article>
                    ))}
                    {hasPendingInput(task?.messages ?? [], w.feedback) && (
                      <article className="iw-message iw-user iw-pending">
                        <span className="iw-author">You</span>
                        <ProductText text={w.feedback!.input} />
                      </article>
                    )}
                    <AgentActivity
                      busy={w.isBusy || w.isLoadingWorkspace}
                      feedback={w.feedback}
                      message={w.executionMessage}
                      task={task}
                    />
                    {!!w.feedback?.steps.length && !w.isBusy && hasResult && (
                      <details className="iw-receipt">
                        <summary>
                          View activity
                          <ChevronDown />
                        </summary>
                        <ol>
                          {w.feedback.steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      </details>
                    )}
                    {task?.entities
                      .filter((e) => e.status === "ambiguous")
                      .map((e) => (
                        <div className="iw-choices" key={e.id}>
                          <p>Which one did you mean?</p>
                          {e.choices.map((c) => (
                            <button
                              disabled={w.isBusy || w.isLoadingWorkspace}
                              key={c.id}
                              onClick={() =>
                                void turn({
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
                    <AdaptiveStage>
                      {task &&
                        questions
                          .filter(
                            (node) =>
                              !task.canvas?.answers[
                                `${task.canvas.surface.id}:${node.id}`
                              ],
                          )
                          .map((node) => (
                            <TaskCanvas
                              key={node.id}
                              task={task}
                              busy={w.isBusy || w.isLoadingWorkspace}
                              onTurn={turn}
                              focusNodeId={node.id}
                              inline
                            />
                          ))}
                    </AdaptiveStage>
                    <div ref={end} />
                  </div>
                </div>
              </section>
              {hasResult && (
                <section
                  ref={outputRef}
                  className="iw-inline-output"
                  aria-label="Your work"
                  aria-busy={w.isBusy || w.isLoadingWorkspace}
                >
                  {task ? (
                    <Work
                      key={task.id}
                      task={task}
                      busy={w.isBusy || w.isLoadingWorkspace}
                      onTurn={turn}
                      onTask={w.acceptTask}
                      onLoad={open}
                    />
                  ) : (
                    <LoadingSurface mode="output" />
                  )}
                </section>
              )}
            </div>
            <footer className="iw-workspace-footer">
              <div className="iw-dock">
                {composer}
                <p>Discover, decide, create.</p>
              </div>
            </footer>
          </section>
        )}
        {(page === "explore" || page === "maps") && task && (
          <section className="iw-standalone-reference" aria-label="Discover and maps">
            <ReferenceWork task={task} view={page === "maps" ? "maps" : exploreView}
              busy={w.isBusy || w.isLoadingWorkspace} onTurn={turn}
              onNavigate={(view) => { setExploreView(view); if (view === "maps") navigate("maps"); else if (page === "maps") navigate("explore"); }} />
            <div className="iw-standalone-composer">{composer}</div>
          </section>
        )}
        {page === "create" && task && (
          <section className="iw-standalone-reference" aria-label="Create work">
            {task.work?.documents.length || task.artifacts.length || task.canvas ? (
              <Work key={task.id + ":create"} task={task} busy={w.isBusy || w.isLoadingWorkspace}
                onTurn={turn} onTask={w.acceptTask} onLoad={open} preferred="documents"/>
            ) : (
              <div className="ir-empty"><h2>Make something real.</h2>
                <p>Start with your idea in the composer. Igor will create editable work from the conversation.</p></div>
            )}
            <div className="iw-standalone-composer">{composer}</div>
          </section>
        )}
        {(page === "create" || page === "explore" || page === "maps") && !task && <LoadingSurface mode="output" />}
        {page === "history" && (
          <section className="iw-library iw-history-page">
            <header className="iw-history-heading">
              <h1>Conversations</h1>
              <p>Pick up where you left off.</p>
            </header>
            <label className="iw-history-search">
              <Search />
              <span className="iw-sr">Search conversations</span>
              <input
                type="search"
                placeholder="Find a conversation"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
              />
            </label>
            {historyError && (
              <p role="alert">
                {historyError}
                <button
                  onClick={() =>
                    void w
                      .loadHistory()
                      .then(() => setHistoryError(""))
                      .catch(() => {})
                  }
                >
                  Try again
                </button>
              </p>
            )}
            {historyLoading && <LoadingSurface mode="history" />}
            <div className="iw-history-list" aria-busy={historyLoading}>
              {matchingHistory.map((h) => (
                <button
                  key={h.id}
                  disabled={w.isBusy || w.isLoadingWorkspace}
                  onClick={() => void open(h.id)}
                >
                  <span className="iw-history-copy">
                    <strong>{conversationTitle(h.title || h.goal)}</strong>
                    {h.preview && <span>{h.preview}</span>}
                  </span>
                  <span className="iw-history-meta">
                    {h.updatedAt &&
                      Number.isFinite(Date.parse(h.updatedAt)) && (
                        <time dateTime={h.updatedAt}>
                          {new Intl.DateTimeFormat(undefined, {
                            month: "short",
                            day: "numeric",
                          }).format(new Date(h.updatedAt))}
                        </time>
                      )}
                    <ArrowRight />
                  </span>
                </button>
              ))}
            </div>
            {!historyLoading &&
              !!w.history.length &&
              !matchingHistory.length && (
                <div className="iw-history-empty" role="status">
                  <p>No conversations match “{historySearch.trim()}”.</p>
                  <button onClick={() => setHistorySearch("")}>
                    Clear search
                  </button>
                </div>
              )}
            {!historyLoading && !w.history.length && !historyError && (
              <div className="iw-history-empty">
                <h2>A place to come back to.</h2>
                <p>Your conversations will appear here as you go.</p>
                <button
                  onClick={() => void fresh()}
                  disabled={w.isBusy || w.isLoadingWorkspace}
                >
                  Start a conversation
                  <ArrowRight />
                </button>
              </div>
            )}
          </section>
        )}
        {page === "saved" && !task && (
          <section className="iw-library">
            <h1>Your collection.</h1>
            <LoadingSurface mode="collection" />
          </section>
        )}
        {page === "saved" && task && (
          <Saved
            onDiscover={async (request) => {
              await turn({ type: "message", text: request });
            }}
            busy={w.isBusy || w.isLoadingWorkspace}
            task={task}
            onTask={w.acceptTask}
            onTurn={turn}
            onLoad={open}
          />
        )}
        {w.errorMessage && (
          <div className="iw-error" role="alert">
            <p>{w.errorMessage}</p>
            {!task && !w.isLoadingWorkspace && (
              <button onClick={() => window.location.reload()}>
                Retry workspace
                <ArrowRight />
              </button>
            )}
            {w.feedback?.state === "error" && (
              <button
                disabled={w.isBusy || w.isLoadingWorkspace}
                onClick={() => void turn(w.feedback!.action)}
              >
                Try again
                <ArrowRight />
              </button>
            )}
            <button
              aria-label="Dismiss error"
              onClick={() => w.setErrorMessage("")}
            >
              <X />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Work({
  task,
  busy,
  onTurn,
  onTask,
  onLoad,
  preferred,
}: {
  task: Task;
  busy: boolean;
  onTurn: (a: TaskAction) => Promise<void>;
  onTask: (t: Task) => void;
  onLoad: (id: string) => Promise<void>;
  preferred?: string;
}) {
  const [resource, setResource] = useState<string | null>(preferred ?? null);
  const research = buildResearchCards(task);
  const placeNode = task.canvas?.surface.nodes.find(
    (node) => node.type === "spatial",
  );
  const hasCanvasWork = task.canvas?.surface.nodes.some(
    (node) =>
      !["question", "stack", "columns", "tabs", "activity"].includes(node.type),
  );
  // A gathering is not an invitation. Only expose the editor once a
  // genuine invitation artifact has been saved to this task.
  const hasInvitation = Boolean(projectInvitationScene(task)?.artifact);
  const resources = [
    ...(task.candidates.length || task.catalogue.length ? [{ id: "discover", title: "Discover" }] : []),
    ...(task.candidates.length + task.catalogue.length > 1 ? [{ id: "compare", title: "Compare" }] : []),
    ...(task.brief.selected.length || task.schedule.length ? [{ id: "plan", title: "Plan" }] : []),
    ...(task.candidates.length ? [{ id: "detail", title: "Details" }] : []),
    ...(task.receipts?.length || task.artifactHistory?.length ? [{ id: "revisions", title: "Versions" }] : []),
    ...(hasInvitation ? [{ id: "invite", title: "Invitation" }] : []),
    ...(hasCanvasWork || research
      ? [{ id: "workspace", title: research ? "Explore" : "Current view" }]
      : []),
    ...(task.work?.documents.length
      ? [{ id: "documents", title: "Documents" }]
      : []),
    ...(task.work?.decisions.length && !task.work?.documents.length
      ? [{ id: "options", title: "Options" }]
      : []),
    ...(task.artifacts.length
      ? [{ id: "drafts", title: research ? "Research notes" : "Drafts" }]
      : []),
    ...(placeNode ? [{ id: "places", title: "Places" }] : []),
    ...(task.candidates.some((candidate) => candidate.cultural)
      ? [{ id: "connections", title: "Connections" }]
      : []),
  ];
  // Follow actual available work on first render, instead of pinning every
  // gathering to the invitation tab. Retain explicit user tab selection.
  const active =
    resource && resources.some((item) => item.id === resource)
      ? resource
      : resources[0]?.id;
  const saved = useSavedOutcomes(task, onTask, onTurn);
  const kept = new Set(
    saved.data.collections.flatMap((collection) =>
      collection.items.map((item) => item.id),
    ),
  );

  return (
    <div className="iw-result-content">
      {resources.length > 1 && (
        <nav className="iw-resource-tabs" aria-label="Work surfaces">
          {resources.map((item) => (
            <button
              key={item.id}
              aria-pressed={active === item.id}
              onClick={() => {
                if (
                  !window.dispatchEvent(
                    new Event("beforeunload", { cancelable: true }),
                  ) &&
                  !window.confirm("Leave this surface with unsaved edits?")
                ) {
                  return;
                }

                morphLayout(() => setResource(item.id));
              }}
            >
              {item.title}
            </button>
          ))}
        </nav>
      )}
      {active === "workspace" &&
        (research ? (
          <ResearchDiscovery task={task} busy={busy} onTurn={onTurn} />
        ) : (
          <TaskCanvas
            task={task}
            busy={busy}
            onTurn={onTurn}
            excludeQuestions
          />
        ))}
      {(["discover", "compare", "plan", "detail", "revisions"].includes(active || "")) && (
        <ReferenceWork task={task} view={active as "discover" | "compare" | "plan" | "detail" | "revisions"} busy={busy}
          onTurn={onTurn} onNavigate={(view) => setResource(view)} />
      )}
      {active === "invite" && (
        <InvitationStudio task={task} busy={busy} onTurn={onTurn} />
      )}
      {active === "documents" && (
        <ConnectedWorkCanvas task={task} busy={busy} onTurn={onTurn} />
      )}
      {active === "options" && <DecisionWork task={task} />}
      {active === "connections" && <Connections task={task} onTurn={onTurn} />}
      {active === "drafts" && (
        <ArtifactWork task={task} busy={busy} onTurn={onTurn} onTask={onTask} />
      )}
      {active === "places" && placeNode && (
        <TaskCanvas
          task={task}
          busy={busy}
          onTurn={onTurn}
          focusNodeId={placeNode.id}
        />
      )}
      {active !== "invite" && task.candidates.length > 0 && (
        <section className="iw-references">
          <header>
            <h2>Connected references</h2>
            <span>From your conversation</span>
          </header>
          <div>
            {task.candidates
              .filter((c) => c.freshness === "current")
              .map((c) => (
                <article key={c.id}>
                  {c.imageUrl && <LoadingImage src={c.imageUrl} />}
                  <small>{c.type.replaceAll("_", " ")}</small>
                  <h3>{c.name}</h3>
                  <p>{c.description}</p>
                  <button
                    className="iw-keep"
                    disabled={busy || saved.isBusy || kept.has(c.id)}
                    onClick={() =>
                      void saved.saveOutput({
                        type: "collection",
                        title: c.name,
                        candidateIds: [c.id],
                      })
                    }
                  >
                    <Bookmark />
                    {kept.has(c.id) ? "Saved" : "Save reference"}
                  </button>
                  <details>
                    <summary>
                      Behind this connection
                      <ChevronDown />
                    </summary>
                    {task.evidence
                      .filter((e) => c.evidenceIds.includes(e.id))
                      .map((e) => (
                        <div key={e.id}>
                          <small>
                            {e.delivery || "Supplied"} ·{" "}
                            {new Date(e.at).toLocaleDateString()}
                          </small>
                          <p>{e.summary}</p>
                          {e.limitations.map((l) => (
                            <p key={l}>{l}</p>
                          ))}
                        </div>
                      ))}
                  </details>
                </article>
              ))}
          </div>
        </section>
      )}
      {saved.errorMessage && <p role="alert">{saved.errorMessage}</p>}
      <WorkSharing
        task={task}
        onTask={onTask}
        onTurn={onTurn}
        onLoad={onLoad}
      />
    </div>
  );
}

function ArtifactWork({
  task,
  busy,
  onTurn,
  onTask,
}: {
  task: Task;
  busy: boolean;
  onTurn: (a: TaskAction) => Promise<void>;
  onTask: (t: Task) => void;
}) {
  const [id, setId] = useState("");
  const artifact = task.artifacts.find((a) => a.id === id) || task.artifacts[0];

  return (
    <section className="iw-artifact">
      <nav aria-label="Documents">
        {task.artifacts.map((a) => (
          <button
            key={a.id}
            aria-pressed={a.id === artifact.id}
            onClick={() => setId(a.id)}
          >
            {a.title}
          </button>
        ))}
      </nav>
      {task.artifacts.map((a) => (
        <div hidden={a.id !== artifact.id} key={a.id}>
          <Draft artifact={a} busy={busy} onTurn={onTurn} />
        </div>
      ))}
      <span className="iw-footnote">
        Review assumptions and practical details before sharing.
      </span>
    </section>
  );
}

function Draft({
  artifact,
  busy,
  onTurn,
}: {
  artifact: Artifact;
  busy: boolean;
  onTurn: (a: TaskAction) => Promise<void>;
}) {
  const [draft, setDraft] = useState(artifact.content);
  const [base, setBase] = useState(artifact.content);
  const [editing, setEditing] = useState(false);
  const dirty = draft !== base;

  if (artifact.content !== base && (!dirty || artifact.content === draft)) {
    setBase(artifact.content);
    setDraft(artifact.content);
  }

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <>
      <header>
        <h2>{artifact.title}</h2>
        <button onClick={() => setEditing(!editing)}>
          {editing ? "Preview" : "Edit draft"}
        </button>
      </header>
      {editing ? (
        <textarea
          aria-label={`Edit ${artifact.title}`}
          value={draft}
          readOnly={!!artifact.locked || artifact.freshness !== "current"}
          maxLength={10000}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <article className="iw-paper">
          <ProductText text={draft} />
        </article>
      )}
      <div className="iw-draft-tools">
        <button
          disabled={
            busy ||
            !dirty ||
            !!artifact.locked ||
            artifact.freshness !== "current" ||
            base !== artifact.content
          }
          onClick={() =>
            void onTurn({
              type: "artifact",
              artifactId: artifact.id,
              content: draft,
            })
          }
        >
          <Save />
          Save changes
        </button>
        <button
          disabled={
            busy ||
            dirty ||
            (!artifact.locked && artifact.freshness !== "current")
          }
          onClick={() =>
            void onTurn({
              type: "artifact-lock",
              artifactId: artifact.id,
              locked: !artifact.locked,
            })
          }
        >
          {artifact.locked ? "Unlock for editing" : "Approve and lock"}
        </button>
        <span>
          {dirty
            ? "Unsaved changes"
            : artifact.freshness === "stale"
              ? "Needs review"
              : artifact.locked
                ? "Approved"
                : "Saved draft"}
        </span>
      </div>
    </>
  );
}

function WorkSharing({
  task,
  onTask,
  onTurn,
}: {
  task: Task;
  onTask: (t: Task) => void;
  onTurn: (a: TaskAction) => Promise<void>;
  onLoad: (id: string) => Promise<void>;
}) {
  const saved = useSavedOutcomes(task, onTask, onTurn);

  return (
    <details className="iw-sharing">
      <summary>
        <Share2 />
        Save and share
        <ChevronDown />
      </summary>
      {task.artifacts.some((artifact) => artifact.id === "main") && (
        <a
          href={`/api/tasks/${task.id}/export?format=markdown&version=${task.brief.version}`}
          download
        >
          Download Markdown
        </a>
      )}
      <ProductSharing
        task={task}
        shares={saved.data.shares}
        reviews={saved.data.reviews}
        isBusy={saved.isBusy}
        saveOutput={saved.saveOutput}
        onRefresh={saved.refresh}
      />
      {saved.errorMessage && <p role="alert">{saved.errorMessage}</p>}
    </details>
  );
}

function Saved({
  task,
  onTask,
  onTurn,
  onLoad,
  onDiscover,
  busy,
}: {
  task: Task;
  busy: boolean;
  onDiscover: (request: string) => Promise<void>;
  onTask: (t: Task) => void;
  onTurn: (a: TaskAction) => Promise<void>;
  onLoad: (id: string) => Promise<void>;
}) {
  const saved = useSavedOutcomes(task, onTask, onTurn);

  return (
    <section className="iw-library">
      <h1>Your collection.</h1>
      {saved.isLoading ? (
        <LoadingSurface mode="collection" />
      ) : (
        <ProductCollections
          task={task}
          collections={saved.data.collections}
          isBusy={saved.isBusy || busy}
          saveOutput={saved.saveOutput}
          onDiscover={onDiscover}
          onLoad={async (id) => {
            await onLoad(id);

            return true;
          }}
        />
      )}
      {saved.errorMessage && <p role="alert">{saved.errorMessage}</p>}
    </section>
  );
}

function conversationTitle(value?: string) {
  if (!value) {
    return "A new thought";
  }

  return starts.find((start) => start.prompt === value)?.title ?? value;
}
