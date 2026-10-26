"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Film,
  History,
  LoaderCircle,
  MapPin,
  Music2,
  Plus,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Task, TaskAction } from "@/core/contracts";
import { useWorkspace } from "./use-workspace";

const categories = ["All", "Places", "Music", "Film & TV"] as const;
type Category = (typeof categories)[number];
type Candidate = Task["candidates"][number] | Task["catalogue"][number];

const shortcuts = [
  {
    number: "01",
    title: "Follow a sound into a city.",
    description: "See Tokyo through a Radiohead starting point.",
    kind: "CITY × SOUND",
    action: { type: "place-example", city: "Tokyo" },
    tone: "sky",
  },
  {
    number: "02",
    title: "Find everyone's kind of night.",
    description: "Try a six-person example with different tastes.",
    kind: "SHARED EXPERIENCES",
    action: { type: "sample" },
    tone: "peach",
  },
] as const;

export function Home() {
  const {
    task,
    isBusy,
    errorMessage,
    executionMessage,
    history,
    loadHistory,
    createWorkspace,
    openWorkspace,
    sendTurn,
  } = useWorkspace();
  const [homeVisible, setHomeVisible] = useState(true);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [artist, setArtist] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [refinementVisible, setRefinementVisible] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (task?.brief.goal) {
      setHomeVisible(false);
    }
  }, [task?.brief.goal]);

  const hasResult = Boolean(task?.brief.goal);
  const suggestions = task
    ? task.candidates.length > 0
      ? task.candidates
      : task.catalogue
    : [];
  const filteredSuggestions = suggestions.filter((candidate) => {
    if (activeCategory === "All") {
      return true;
    }

    if (activeCategory === "Places") {
      return candidate.type === "place";
    }

    if (activeCategory === "Music") {
      return candidate.type === "artist";
    }

    return candidate.type === "movie" || candidate.type === "tv_show";
  });
  const shownSuggestions = expanded
    ? filteredSuggestions
    : filteredSuggestions.slice(0, 9);
  const selected = suggestions.find((candidate) => candidate.id === selectedId);

  async function begin(action: TaskAction) {
    if (!task || isBusy) {
      return;
    }

    setHomeVisible(false);
    setSelectedId(null);
    setActiveCategory("All");
    setRefinementVisible(false);
    await sendTurn(action);
  }

  async function startFresh() {
    if (isBusy) {
      return;
    }

    await createWorkspace();
    setHomeVisible(true);
    setPrompt("");
    setArtist("");
    setSelectedId(null);
    setRefinementVisible(false);
  }

  function sendMessage() {
    const text = prompt.trim();

    if (!text || isBusy || !task) {
      return;
    }

    setPrompt("");
    void begin({ type: "message", text });
  }

  async function showHistory() {
    setHistoryVisible(true);

    try {
      await loadHistory();
    } catch {
      // The current workspace remains available if history cannot load.
    }
  }

  async function resume(id: string) {
    try {
      if (await openWorkspace(id)) {
        setHistoryVisible(false);
        setHomeVisible(false);
        setSelectedId(null);
      }
    } catch {
      // The user can still open the advanced workspace to recover a session.
    }
  }

  return (
    <div className="ig-app">
      <div className="ig-grain" aria-hidden="true" />
      <header className="ig-header">
        <button
          className="ig-brand"
          aria-label="Igor home"
          onClick={() => void startFresh()}
          type="button"
        >
          <span className="ig-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>igor<span className="ig-brand-stop">.</span></span>
        </button>
        <nav className="ig-header-nav" aria-label="Navigation">
          <button type="button" onClick={() => void startFresh()} aria-current={homeVisible ? "page" : undefined}>Discover</button>
          <button type="button" onClick={() => void showHistory()}>Your spaces</button>
          <Link href="/workspace">Workspace <ArrowUpRight size={14} /></Link>
        </nav>
        <button className="ig-header-cta" type="button" onClick={() => void startFresh()} disabled={isBusy}>
          <Plus size={17} /> New discovery
        </button>
      </header>

      {homeVisible ? (
        <main id="main" className="ig-home">
          <section className="ig-hero" aria-labelledby="ig-heading">
            <div className="ig-hero-copy">
              <span className="ig-overline"><span className="ig-live-dot" /> A DIFFERENT WAY TO DISCOVER</span>
              <h1 id="ig-heading">One thing you <span className="ig-love">love<span className="ig-love-swish" /></span><br />A world it <span className="ig-opens">opens.</span></h1>
              <p>Music, films, places and ideas don&apos;t live in separate worlds. Igor connects them, using your taste as a starting point.</p>
              <button
                type="button"
                className="ig-dark-button"
                onClick={() => promptRef.current?.focus()}
              >
                Tell Igor what&apos;s on your mind <span><ArrowRight size={19} /></span>
              </button>
              <span className="ig-small-note">No account setup. No perfect prompt. Just begin.</span>
            </div>
            <div className="ig-hero-art" aria-label="An illustration of taste leading to cultural discoveries">
              <div className="ig-hero-art-label">A SMALL SPARK. ENDLESS ROUTES.</div>
              <svg viewBox="0 0 560 450" role="img" aria-label="Connections radiating from a central starting point">
                <path d="M280 226 C170 225 166 96 75 96" />
                <path d="M280 226 C384 225 402 85 498 104" />
                <path d="M280 226 C169 238 144 355 76 366" />
                <path d="M280 226 C375 252 388 341 498 352" />
              </svg>
              <div className="ig-orb ig-orb-seed"><span>START HERE</span><strong>what you<br />love</strong><Sparkles size={26} /></div>
              <div className="ig-orb ig-orb-film"><Film size={24} /><span>stories</span></div>
              <div className="ig-orb ig-orb-place"><MapPin size={25} /><span>places</span></div>
              <div className="ig-orb ig-orb-music"><Music2 size={26} /><span>sounds</span></div>
              <div className="ig-orb ig-orb-people"><Users size={27} /><span>people</span></div>
              <span className="ig-orb-star ig-orb-star-one" aria-hidden="true">✳</span>
              <span className="ig-orb-star ig-orb-star-two" aria-hidden="true">✦</span>
            </div>
          </section>

          <section className="ig-prompt-band" aria-label="Ask Igor">
            <div className="ig-prompt-heading">
              <span className="ig-prompt-spark"><Sparkles size={23} /></span>
              <span>What are you curious about?</span>
            </div>
            <form className="ig-prompt-form" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
              <label className="ig-sr-only" htmlFor="ig-home-prompt">What would you like Igor to explore?</label>
              <textarea
                id="ig-home-prompt"
                ref={promptRef}
                rows={2}
                maxLength={3000}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Plan a weekend around my favorite music..."
                disabled={isBusy || !task}
              />
              <button type="submit" disabled={!prompt.trim() || isBusy || !task} aria-label="Send your idea">
                {isBusy ? <LoaderCircle className="ig-spin" size={23} /> : <ArrowRight size={23} />}
              </button>
            </form>
            <p>Igor uses Qloo cultural evidence. Availability, travel times and prices are never assumed.</p>
          </section>

          <section className="ig-ways" aria-labelledby="ig-ways-title">
            <div className="ig-section-heading"><span>CURIOUS? START SOMEWHERE.</span><h2 id="ig-ways-title">A few ways in<span className="ig-punctuation">.</span></h2></div>
            <div className="ig-ways-grid">
              {shortcuts.map((shortcut) => (
                <button
                  className={`ig-way-card ig-way-${shortcut.tone}`}
                  key={shortcut.number}
                  type="button"
                  disabled={isBusy || !task}
                  onClick={() => void begin(shortcut.action)}
                >
                  <span className="ig-way-heading"><span>{shortcut.number} / {shortcut.kind}</span><ArrowUpRight size={20} /></span>
                  <strong>{shortcut.title}</strong>
                  <span className="ig-way-bottom"><span>{shortcut.description}</span><span className="ig-way-arrow"><ArrowRight size={20} /></span></span>
                  <span className="ig-way-art" aria-hidden="true">{shortcut.tone === "sky" ? "♫" : "✳"}</span>
                </button>
              ))}
              <form className="ig-way-card ig-way-lime" onSubmit={(event) => {
                event.preventDefault();
                if (artist.trim()) {
                  void begin({ type: "personal-profile", name: "You", artist: artist.trim() });
                }
              }}>
                <span className="ig-way-heading"><span>03 / YOUR OWN TASTE</span><Music2 size={20} /></span>
                <strong>Start with someone you listen to.</strong>
                <div className="ig-artist-input">
                  <label className="ig-sr-only" htmlFor="ig-artist">An artist you love</label>
                  <input id="ig-artist" placeholder="Name an artist" value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={100} required disabled={isBusy || !task} />
                  <button type="submit" disabled={!artist.trim() || isBusy || !task} aria-label="Explore from this artist"><ArrowRight size={19} /></button>
                </div>
                <span className="ig-way-art" aria-hidden="true">✺</span>
              </form>
            </div>
          </section>
          <footer className="ig-footer"><span>Igor. Go where your curiosity goes.</span><span>Discover / Connect / Create</span></footer>
        </main>
      ) : (
        <main id="main" className="ig-result" aria-live="polite">
          <div className="ig-result-topline">
            <button className="ig-back" type="button" onClick={() => void startFresh()}><ArrowLeft size={18} /> Discover</button>
            <span className="ig-result-mode"><span className="ig-live-dot" /> {task?.mode === "qloo-live" ? "Qloo discovery mode" : "Illustrative example"}</span>
          </div>
          <section className="ig-result-hero">
            <div className="ig-result-heading">
              <span className="ig-overline">YOUR CULTURAL THREAD</span>
              <h1>{task?.brief.goal || (isBusy ? "Finding your way in." : "A new discovery.")}</h1>
              <p>{task?.status === "clarification"
                ? "One small detail will help Igor make the next connection."
                : "Follow the connections. Keep the discoveries worth exploring. Make this your own."}</p>
              <div className="ig-result-pills">
                <span><Compass size={15} /> {task?.brief.kind ?? "Discovery"}</span>
                {task?.brief.targetType && <span><Sparkles size={15} /> {task.brief.targetType}</span>}
                {task && <span><Check size={15} /> Version {task.brief.version}</span>}
              </div>
            </div>
            <div className="ig-result-symbol" aria-hidden="true"><span>igor</span><i>✳</i></div>
          </section>

          {(isBusy || executionMessage) && (
            <div className="ig-progress" role="status"><LoaderCircle className="ig-spin" size={21} /><span>{executionMessage || "Connecting the dots..."}</span></div>
          )}
          {(errorMessage || task?.error) && <p className="ig-error" role="alert">{errorMessage || task?.error}</p>}

          {task?.brief.unresolved.length ? (
            <section className="ig-clarify" aria-labelledby="ig-clarify-heading">
              <h2 id="ig-clarify-heading">One thing to clear up.</h2>
              {task.brief.unresolved.map((question) => <p key={question}>{question}</p>)}
              {task.entities.filter((entity) => entity.status === "ambiguous").map((entity) => (
                <div className="ig-choices" key={entity.id}>
                  {entity.choices.map((choice) => (
                    <button key={choice.id} type="button" disabled={isBusy} onClick={() => void begin({ type: "resolve", entityId: entity.id, choiceId: choice.id })}>
                      {choice.name} {choice.metadata ? `· ${choice.metadata}` : ""} <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              ))}
            </section>
          ) : null}

          {task && suggestions.length > 0 && (
            <section className="ig-discoveries" aria-labelledby="ig-discoveries-heading">
              <div className="ig-section-heading ig-section-heading-inline">
                <div><span>THE CONNECTIONS</span><h2 id="ig-discoveries-heading">Where it leads<span className="ig-punctuation">.</span></h2></div>
                <span className="ig-section-context">{suggestions.length} {task.mode === "illustrative-fixtures" ? "illustrative" : "cultural"} {suggestions.length === 1 ? "discovery" : "discoveries"}</span>
              </div>
              <div className="ig-filters" role="group" aria-label="Filter discoveries">
                {categories.map((category) => (
                  <button key={category} type="button" aria-pressed={activeCategory === category} onClick={() => { setActiveCategory(category); setExpanded(false); }}>
                    {category}{category === "All" ? ` · ${suggestions.length}` : ""}
                  </button>
                ))}
              </div>
              {filteredSuggestions.length === 0 ? (
                <div className="ig-no-results">No {activeCategory.toLowerCase()} in this result. Choose another view or refine the brief.</div>
              ) : (
                <div className="ig-result-grid">
                  {shownSuggestions.map((candidate, index) => (
                    <DiscoveryCard
                      key={candidate.id}
                      candidate={candidate}
                      index={index}
                      active={selectedId === candidate.id}
                      onSelect={() => setSelectedId(selectedId === candidate.id ? null : candidate.id)}
                    />
                  ))}
                </div>
              )}
              {!expanded && filteredSuggestions.length > 9 && (
                <button className="ig-see-more" onClick={() => setExpanded(true)} type="button">See all {filteredSuggestions.length} discoveries <ChevronDown size={18} /></button>
              )}
            </section>
          )}

          {selected && task && (
            <CandidateDetails
              candidate={selected}
              task={task}
              busy={isBusy}
              onClose={() => setSelectedId(null)}
              onConnection={(targetType) => void begin({ type: "connection", candidateId: selected.id, targetType })}
            />
          )}

          {!isBusy && hasResult && suggestions.length === 0 && task?.status !== "clarification" && (
            <section className="ig-empty-result">
              <Sparkles size={28} />
              <h2>The next connection needs a little more.</h2>
              <p>{task?.error || "Igor has not returned any cultural options for this brief. Try a known artist, a city, or a more specific goal."}</p>
            </section>
          )}

          {task && task.evidence.length > 0 && (
            <EvidenceStrip task={task} />
          )}

          <section className="ig-refine" aria-labelledby="ig-refine-heading">
            <div>
              <span className="ig-overline">KEEP THE CONVERSATION GOING</span>
              <h2 id="ig-refine-heading">Another direction?</h2>
              <p>Change a constraint, ask for a different angle, or follow a fresh taste. Igor will update the same workspace.</p>
            </div>
            <button type="button" className="ig-refine-trigger" onClick={() => setRefinementVisible(!refinementVisible)} aria-expanded={refinementVisible}>
              <SlidersHorizontal size={18} /> Refine this discovery <ArrowRight size={18} />
            </button>
            {refinementVisible && (
              <form className="ig-refine-form" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
                <label htmlFor="ig-refine-prompt">Tell Igor what to change</label>
                <div><textarea id="ig-refine-prompt" rows={2} value={prompt} maxLength={3000} onChange={(event) => setPrompt(event.target.value)} placeholder="Make it a shorter weekend, and focus on film..." disabled={isBusy || !task} /><button type="submit" disabled={!prompt.trim() || isBusy}><Send size={20} /><span className="ig-sr-only">Submit refinement</span></button></div>
              </form>
            )}
            <div className="ig-result-actions">
              <Link href="/workspace"><Bookmark size={18} /> Keep, share and edit</Link>
              <button type="button" onClick={() => void startFresh()} disabled={isBusy}><RotateCcw size={18} /> Start something new</button>
            </div>
          </section>
          <footer className="ig-footer"><span>Powered by taste intelligence, not invented certainty.</span><span>Igor / Qloo</span></footer>
        </main>
      )}

      <nav className="ig-mobile-nav" aria-label="Mobile navigation">
        <button type="button" onClick={() => void startFresh()} disabled={isBusy}>
          <Compass size={20} />
          <span>Discover</span>
        </button>
        <button type="button" onClick={() => void showHistory()}>
          <History size={20} />
          <span>Your spaces</span>
        </button>
        <Link href="/workspace">
          <SlidersHorizontal size={20} />
          <span>Workspace</span>
        </Link>
      </nav>

      {historyVisible && (
        <div className="ig-drawer-backdrop" role="presentation" onClick={() => setHistoryVisible(false)}>
          <aside className="ig-drawer" role="dialog" aria-modal="true" aria-label="Your saved workspaces" onClick={(event) => event.stopPropagation()}>
            <div className="ig-drawer-heading"><div><span>YOUR SPACES</span><h2>Pick up a thread.</h2></div><button type="button" onClick={() => setHistoryVisible(false)} aria-label="Close spaces"><X size={21} /></button></div>
            {history.length ? history.map((workspace) => (
              <button key={workspace.id} type="button" className="ig-history-item" onClick={() => void resume(workspace.id)}><History size={19} /><span>{workspace.goal || "Untitled exploration"}</span><ArrowUpRight size={17} /></button>
            )) : <p className="ig-drawer-empty">Your finished discoveries will appear here after you begin.</p>}
            <Link className="ig-drawer-link" href="/workspace">Open advanced workspace <ArrowUpRight size={16} /></Link>
          </aside>
        </div>
      )}
    </div>
  );
}

function DiscoveryCard({
  candidate,
  index,
  active,
  onSelect,
}: {
  candidate: Candidate;
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  const delivery = candidate.cultural
    ? Object.values(candidate.cultural).some((signal) => signal.delivery === "LIVE")
      ? "LIVE"
      : "CACHED"
    : candidate.sample
      ? "EXAMPLE"
      : "SUPPLIED";

  return (
    <button className={`ig-discovery-card ig-discovery-tone-${index % 5}`} type="button" onClick={onSelect} aria-expanded={active}>
      <span className="ig-discovery-visual" style={candidate.imageUrl ? { backgroundImage: `linear-gradient(180deg, transparent 10%, rgba(20, 18, 28, .48)), url("${candidate.imageUrl}")` } : undefined}>
        {!candidate.imageUrl && <span className="ig-discovery-glyph" aria-hidden="true">{candidate.type === "place" ? "↗" : candidate.type === "artist" ? "♫" : "✳"}</span>}
        <span className="ig-discovery-number">{String(index + 1).padStart(2, "0")}</span>
        <span className="ig-discovery-arrow"><ArrowUpRight size={19} /></span>
      </span>
      <span className="ig-discovery-copy"><span className="ig-discovery-category">{candidate.type.replace("_", " ")} <span>·</span> {delivery}</span><strong>{candidate.name}</strong><small>{candidate.description || "A connection to explore."}</small></span>
    </button>
  );
}

function CandidateDetails({
  candidate,
  task,
  busy,
  onClose,
  onConnection,
}: {
  candidate: Candidate;
  task: Task;
  busy: boolean;
  onClose: () => void;
  onConnection: (type: "artist" | "movie") => void;
}) {
  const signals = candidate.cultural ? Object.values(candidate.cultural) : [];
  const canFollow = task.candidates.some(
    (current) =>
      current.id === candidate.id &&
      current.freshness === "current" &&
      Boolean(current.providerId && current.cultural),
  );

  return (
    <section className="ig-detail" aria-label={`${candidate.name} details`}>
      <div className="ig-detail-heading"><div><span>LOOK A LITTLE CLOSER</span><h2>{candidate.name}</h2></div><button type="button" aria-label="Close details" onClick={onClose}><X size={20} /></button></div>
      <div className="ig-detail-grid">
        <div><p>{candidate.description || "A cultural reference returned for this exploration."}</p><div className="ig-detail-chips"><span>{candidate.type.replace("_", " ")}</span>{candidate.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>{candidate.place?.address && <p className="ig-detail-address"><MapPin size={16} /> {candidate.place.address}</p>}{candidate.place?.website && <a className="ig-detail-link" href={candidate.place.website} target="_blank" rel="noreferrer">Visit source site <ArrowUpRight size={16} /></a>}</div>
        <div className="ig-detail-evidence"><strong>What Igor actually knows</strong><p>{signals.length ? `${signals.length} Qloo association ${signals.length === 1 ? "record" : "records"}. These are not verified personal preferences or guarantees.` : "No live cultural signal was attached to this item."}</p><dl><dt>Cultural source</dt><dd>{signals.some((signal) => signal.delivery === "LIVE") ? "LIVE" : signals.length ? "CACHED" : candidate.sample ? "Illustrative" : "User supplied"}</dd><dt>Cost</dt><dd>{candidate.cost.value === null ? "Unknown" : `$${candidate.cost.value} · ${candidate.cost.source}`}</dd><dt>Availability</dt><dd>{candidate.available === null ? "Not confirmed" : candidate.available ? `${candidate.availabilitySource} confirmation` : "Unavailable"}</dd><dt>Provider ID</dt><dd className="ig-id">{candidate.providerId || "Not returned"}</dd></dl></div>
      </div>
      {signals.length > 0 && <details className="ig-technical-detail"><summary>See Qloo retrieval details <ChevronDown size={16} /></summary>{signals.slice(0, 8).map((signal) => <p key={signal.queryId}>{signal.delivery} · rank {signal.rank} · {new Date(signal.retrievedAt).toLocaleString()} · query {signal.queryId}. {signal.explanationScope === "aggregate-query" ? "Contributors apply to the query, not this individual item." : "Association does not establish causation."}</p>)}</details>}
      <div className="ig-detail-actions"><button type="button" disabled={!canFollow || busy} onClick={() => onConnection("artist")}><Music2 size={18} /> Follow into music <ArrowRight size={17} /></button><button type="button" disabled={!canFollow || busy} onClick={() => onConnection("movie")}><Film size={18} /> Follow into film <ArrowRight size={17} /></button><Link href="/workspace">Advanced evidence <ArrowUpRight size={17} /></Link></div>
      {task.mode === "illustrative-fixtures" && <p className="ig-fixture-note">Illustrative mode. These cultural matches are synthetic and are not Qloo evidence.</p>}
    </section>
  );
}

function EvidenceStrip({ task }: { task: Task }) {
  const culturalEvidence = task.evidence.filter((record) => record.kind === "cultural" && record.freshness === "current");
  const live = culturalEvidence.filter((record) => record.delivery === "LIVE").length;
  const cached = culturalEvidence.filter((record) => record.delivery === "CACHED").length;

  return (
    <div className="ig-evidence-strip"><div><span className="ig-evidence-icon"><Check size={18} /></span><div><strong>Source matters.</strong><p>{task.mode === "illustrative-fixtures" ? "Illustrative test data, not Qloo results." : "These are cultural associations, not verified prices, opening hours or a promise of personal fit."}</p></div></div><div className="ig-evidence-counts"><span>{live} live</span><span>{cached} cached</span><Link href="/workspace">Inspect evidence <ArrowUpRight size={15} /></Link></div></div>
  );
}