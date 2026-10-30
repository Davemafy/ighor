"use client";

import { useMemo, useState } from "react";
import type { Task, TaskAction } from "@/core/contracts";
import {
  adaptTaskForPresentation,
  type WorkspaceCandidate,
  type WorkspaceViewModel,
} from "./workspace-view-model";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Heart,
  MapPin,
  Plus,
  Search,
} from "lucide-react";
import { TaskCanvas } from "./task-canvas";

/**
 * These are alternate presentations of the *same* canonical task. They neither
 * fabricate cultural evidence nor maintain a second persisted workspace.
 */
type View = "discover" | "compare" | "plan" | "detail" | "revisions" | "maps";
type Props = {
  task: Task;
  view: View;
  busy: boolean;
  onTurn: (action: TaskAction) => Promise<void>;
  onNavigate: (view: View) => void;
};
type Candidate = WorkspaceCandidate;

const typeLabel = (value: string) => value.replaceAll("_", " ");
const fact = (value: number | null) =>
  value == null
    ? "Not checked"
    : Number.isFinite(value)
      ? String(value)
      : "Not checked";

function CandidateMedia({
  candidate,
  wide = false,
}: {
  candidate: Candidate;
  wide?: boolean;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <div className={`ir-media ${wide ? "ir-media-wide" : ""}`}>
      {candidate.imageUrl && !broken ? (
        <img
          src={candidate.imageUrl}
          alt={candidate.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <div
          className="ir-media-fallback"
          role="img"
          aria-label={`No verified image for ${candidate.name}`}
        >
          <span>{typeLabel(candidate.type)}</span>
          <strong>{candidate.name}</strong>
        </div>
      )}
    </div>
  );
}

function EvidenceSource({ source }: { source: Task["evidence"][number] }) {
  const url =
    source.reference.startsWith("https://") &&
    source.source === "provider-returned"
      ? source.reference
      : null;

  return (
    <article className="ir-evidence" key={source.id}>
      <div className="ir-source-head">
        <strong>
          {source.title ||
            (source.kind === "cultural"
              ? "Qloo cultural evidence"
              : "Source record")}
        </strong>
        <span>
          {source.delivery || source.source} · {source.freshness}
        </span>
      </div>
      <p>{source.summary}</p>
      <small>
        Retrieved{" "}
        {Number.isFinite(Date.parse(source.at))
          ? new Date(source.at).toLocaleDateString()
          : "date unknown"}
      </small>
      {source.explanation && <p>{source.explanation}</p>}
      {!!source.limitations.length && (
        <p className="ir-subtle">{source.limitations.join(" · ")}</p>
      )}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open source <ArrowRight size={15} />
        </a>
      )}
    </article>
  );
}

function CandidateSignals({
  task,
  candidate,
  vm,
}: {
  task: Task;
  candidate: Candidate;
  vm: WorkspaceViewModel;
}) {
  const signals = vm.culturalSignalsForCandidate(candidate.id);
  const sampleIds = new Set(
    task.brief.participants.filter((p) => p.sample).map((p) => p.id),
  );

  return (
    <div className="ir-signals">
      {!signals.length && (
        <p className="ir-subtle">
          No Qloo cultural signal returned for this candidate.
        </p>
      )}
      {signals.map((signal) => (
        <div className="ir-signal" key={signal.key + ":" + signal.queryId}>
          <div className="ir-signal-top">
            <strong>
              {signal.participantName
                ? `${sampleIds.has(signal.participantId || "") ? "Illustrative profile · " : ""}${signal.participantName}`
                : signal.scope === "context"
                  ? "Context query"
                  : "Unattributed query"}
            </strong>
            <span>{signal.delivery}</span>
          </div>
          <p>
            Rank #{signal.rankWithinQuery}{" "}
            <span>within query {signal.queryId}</span>
          </p>
          <p>
            Raw affinity{" "}
            {signal.rawAffinity == null ? "not returned" : signal.rawAffinity}
          </p>
          <small>
            Seeds:{" "}
            {signal.seedIds.length ? signal.seedIds.join(", ") : "Not supplied"}
          </small>
          <small>
            {signal.explanationScope === "recommendation"
              ? "Per-result contributors"
              : signal.explanationScope === "aggregate-query"
                ? "Aggregate-query contributors, not a personal explanation"
                : "No per-result explanation returned"}{" "}
            · {signal.retrievedAt}
          </small>
        </div>
      ))}
    </div>
  );
}

type Inspiration = {
  title: string;
  domain: string;
  image: string;
  fallback: string;
  prompt: string;
};
const inspirationPrimary: Inspiration[] = [
  {
    title: "Dune",
    domain: "Film",
    image: "discover-trending-1.webp",
    fallback: "covers/c08.webp",
    prompt:
      "Help me explore the film Dune, and recommend related films with sources.",
  },
  {
    title: "SZA",
    domain: "Music",
    image: "discover-trending-2.webp",
    fallback: "photos/gallery-800.webp",
    prompt:
      "Explore SZA and recommend related musicians with grounded cultural context.",
  },
  {
    title: "The Bear",
    domain: "TV Series",
    image: "discover-trending-3.webp",
    fallback: "photos/hero-dinner-a-800.webp",
    prompt: "Tell me about The Bear and find related television series.",
  },
  {
    title: "Tokyo",
    domain: "Places",
    image: "discover-trending-4.webp",
    fallback: "photos/gallery-800.webp",
    prompt: "Explore memorable food and design experiences in Tokyo.",
  },
  {
    title: "Radiohead",
    domain: "Music",
    image: "discover-trending-5.webp",
    fallback: "covers/c09.webp",
    prompt: "Explore Radiohead and suggest connected artists and albums.",
  },
];
const inspirationSecondary: Inspiration[] = [
  {
    title: "Indie films",
    domain: "Film",
    image: "discover-crew-1.webp",
    fallback: "covers/c07.webp",
    prompt: "Find independent films with a thoughtful, intimate mood.",
  },
  {
    title: "Live jazz",
    domain: "Music",
    image: "discover-crew-2.webp",
    fallback: "photos/gallery-800.webp",
    prompt: "Find live jazz performances and artists worth exploring.",
  },
  {
    title: "Modern Japanese",
    domain: "Dining",
    image: "discover-crew-3.webp",
    fallback: "photos/hero-dinner-a-800.webp",
    prompt: "Explore modern Japanese cuisine and interesting restaurants.",
  },
  {
    title: "Design hotels",
    domain: "Places",
    image: "discover-crew-4.webp",
    fallback: "photos/london-street-800.webp",
    prompt: "Find beautifully designed hotels for a future trip.",
  },
  {
    title: "Art exhibitions",
    domain: "Experiences",
    image: "discover-crew-5.webp",
    fallback: "covers/c10.webp",
    prompt: "Find contemporary art exhibitions worth visiting.",
  },
];

function InspirationImage({ item }: { item: Inspiration }) {
  return (
    <img
      src={`/reference-art/${item.image}`}
      alt=""
      loading="lazy"
      onError={(event) => {
        const fallback = `/marketing/assets/${item.fallback}`;

        if (
          event.currentTarget.src !== new URL(fallback, location.origin).href
        ) {
          event.currentTarget.src = fallback;
        }
      }}
    />
  );
}

function InspirationRail({
  title,
  items,
  type,
  onChoose,
}: {
  title: string;
  items: Inspiration[];
  type: "portrait" | "landscape";
  onChoose: (item: Inspiration) => void;
}) {
  const [saved, setSaved] = useState<string[]>([]);

  return (
    <section className="ir-reference-rail" aria-label={title}>
      <div className="ir-reference-section-heading">
        <h3>{title}</h3>
        <span>Illustrative inspiration</span>
      </div>
      <div className={`ir-reference-tiles ir-reference-${type}`}>
        {items.map((item) => (
          <article key={item.title} className="ir-reference-tile">
            <div className="ir-reference-image">
              <button
                className="ir-reference-image-open"
                onClick={() => onChoose(item)}
                aria-label={`Explore ${item.title}`}
              >
                <InspirationImage item={item} />
              </button>
              <button
                className="ir-reference-favorite"
                aria-pressed={saved.includes(item.title)}
                aria-label={
                  saved.includes(item.title)
                    ? `Remove ${item.title} from preview shortlist`
                    : `Shortlist ${item.title} for this preview`
                }
                onClick={() =>
                  setSaved((current) =>
                    current.includes(item.title)
                      ? current.filter((value) => value !== item.title)
                      : [...current, item.title],
                  )
                }
              >
                <Heart
                  size={22}
                  fill={saved.includes(item.title) ? "currentColor" : "none"}
                />
              </button>
            </div>
            <button
              className="ir-reference-tile-label"
              onClick={() => onChoose(item)}
            >
              <strong>{item.title}</strong>
              <span>{item.domain}</span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ReferenceWork({ task, view, busy, onTurn, onNavigate }: Props) {
  const vm = useMemo(() => adaptTaskForPresentation(task), [task]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [comparisonEdited, setComparisonEdited] = useState(false);
  const [planTab, setPlanTab] = useState<
    "overview" | "itinerary" | "map" | "options" | "notes"
  >("overview");
  const candidates = vm.candidates.filter(
    (c) => !c.sample && (!("freshness" in c) || c.freshness === "current"),
  );
  const categories = [
    "all",
    "places",
    "films",
    "music",
    "books",
    "dining",
    "experiences",
    "ideas",
  ];
  const matchesCategory = (candidate: Candidate) =>
    category === "all" ||
    (category === "films" &&
      (candidate.type === "movie" || candidate.type === "tv_show")) ||
    (category === "music" && candidate.type === "artist") ||
    (category === "books" && candidate.type === "book") ||
    (category === "places" && candidate.type === "place") ||
    candidate.tags.some((tag) => tag.toLocaleLowerCase() === category);
  const filtered = candidates.filter(
    (c) =>
      matchesCategory(c) &&
      [c.name, c.description, ...c.tags]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const inspirationMatches = (item: Inspiration) =>
    (category === "all" ||
      (category === "films" && ["Film", "TV Series"].includes(item.domain)) ||
      (category === "music" && item.domain === "Music") ||
      (category === "books" && item.title.toLowerCase().includes("book")) ||
      (category === "places" && item.domain === "Places") ||
      category === item.domain.toLowerCase()) &&
    (query.trim() === "" ||
      (item.title + " " + item.domain)
        .toLowerCase()
        .includes(query.trim().toLowerCase()));
  const emptyDiscovery = candidates.length === 0;

  const chosen =
    (selectedId && vm.candidateById.get(selectedId)) ||
    filtered[0] ||
    candidates[0];
  const originalComparisonIds = task.canvas?.comparisonIds.length
    ? task.canvas.comparisonIds
    : task.brief.selected.length
      ? task.brief.selected
      : candidates.slice(0, 4).map((c) => c.id);
  const comparedIds = comparisonEdited
    ? comparisonIds
    : originalComparisonIds.slice(0, 4);
  const compared = comparedIds
    .map((id) => vm.candidateById.get(id))
    .filter((c): c is Candidate => !!c);
  const proposalNode = task.canvas?.surface.nodes.find(
    (node) => node.type === "discovery" || node.type === "spatial",
  );

  async function addToWork(id: string) {
    const canEditItinerary =
      !!proposalNode &&
      !!task.canvas &&
      "candidateIds" in proposalNode &&
      proposalNode.candidateIds.includes(id) &&
      task.candidates.some(
        (candidate) => candidate.id === id && candidate.freshness === "current",
      );

    if (canEditItinerary && task.canvas && proposalNode) {
      const candidateIds = [...new Set([...task.canvas.itineraryIds, id])];
      await onTurn({
        type: "canvas",
        surfaceId: task.canvas.surface.id,
        mutation: {
          operation: "itinerary",
          nodeId: proposalNode.id,
          candidateIds,
        },
      });
    } else {
      // A canvas 'select' only changes visual focus: it does NOT add to a plan.
      // Route unsupported structural changes through the authoritative engine.
      await onTurn({
        type: "message",
        text: `Add the existing candidate with ID ${id} to my current work. Preserve unrelated selections and return the updated work.`,
      });
    }
  }

  function toggleCompare(id: string) {
    const current = comparisonEdited
      ? comparisonIds
      : originalComparisonIds.slice(0, 4);
    setComparisonIds(
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= 4
          ? current
          : [...current, id],
    );
    setComparisonEdited(true);
  }

  const heading =
    view === "discover"
      ? "Explore"
      : view === "compare"
        ? "Compare"
        : view === "plan"
          ? task.brief.goal || "Connected work"
          : view === "maps"
            ? "Places in context"
            : view === "revisions"
              ? "Changes & versions"
              : chosen?.name || "Details";
  const subtitle =
    view === "discover"
      ? "Discover what your work has actually found."
      : view === "compare"
        ? "Evidence side by side, without invented compatibility scores."
        : view === "plan"
          ? "One connected outcome, with its constraints and open decisions."
          : view === "maps"
            ? "Only provider-grounded places appear on the map."
            : view === "revisions"
              ? "Every change linked to the saved task revision."
              : "Source details and limitations";

  return (
    <section className={`ir-surface ir-${view}`} aria-label={heading}>
      {task.mode === "illustrative-fixtures" && (
        <p className="ir-demo-note" role="status">
          Illustrative development data · not live Qloo or verified availability
        </p>
      )}
      <header className="ir-heading">
        <div>
          <h2>{heading}</h2>
          <p>{subtitle}</p>
        </div>
        {view === "detail" && (
          <button
            className="ir-secondary"
            onClick={() => onNavigate("discover")}
          >
            <ArrowRight size={17} /> Back to explore
          </button>
        )}
      </header>

      {view === "discover" && (
        <div className="ir-discover-workspace">
          <form
            className="ir-search"
            onSubmit={(event) => {
              event.preventDefault();
              const text = query.trim();

              if (text) {
                void onTurn({
                  type: "message",
                  text: `Explore ${text}. Find relevant results with sources and explain what is known.`,
                });
              }
            }}
          >
            <Search size={21} aria-hidden="true" />
            <label className="ir-sr" htmlFor="ir-discovery-search">
              Discover across any domain
            </label>
            <input
              id="ir-discovery-search"
              type="search"
              placeholder="Discover something…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="submit"
              className="ir-search-submit"
              disabled={!query.trim() || busy}
              aria-label="Ask Igor to discover"
            >
              <ArrowRight size={23} />
            </button>
          </form>
          <div
            className="ir-chip-row"
            role="group"
            aria-label="Discovery categories"
          >
            {categories.map((cat) => (
              <button
                key={cat}
                aria-pressed={category === cat}
                onClick={() => setCategory(cat)}
              >
                {cat === "all"
                  ? "All"
                  : cat === "films"
                    ? "Films & TV"
                    : cat[0].toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          {emptyDiscovery && (
            <div className="ir-reference-disclaimer">
              These are illustrative starting points, not personalized Qloo
              results. Select any card to ask Igor to research it.
            </div>
          )}
          {emptyDiscovery && (
            <>
              <InspirationRail
                title="Trending to explore"
                type="portrait"
                items={inspirationPrimary.filter(inspirationMatches)}
                onChoose={(item) =>
                  void onTurn({ type: "message", text: item.prompt })
                }
              />
              <InspirationRail
                title="Find your next favorite"
                type="landscape"
                items={inspirationSecondary.filter(inspirationMatches)}
                onChoose={(item) =>
                  void onTurn({ type: "message", text: item.prompt })
                }
              />
              {!inspirationPrimary.some(inspirationMatches) &&
                !inspirationSecondary.some(inspirationMatches) && (
                  <div className="ir-empty">
                    <h3>No matching examples</h3>
                    <p>Search for anything above and Igor will research it.</p>
                  </div>
                )}
            </>
          )}
          {!emptyDiscovery && (
            <>
              <div className="ir-section-line">
                <h3>Discovered for this task</h3>
                <span>
                  {filtered.length} grounded{" "}
                  {filtered.length === 1 ? "result" : "results"}
                </span>
              </div>
              <div className="ir-gallery">
                {filtered.map((c) => (
                  <article key={c.id} className="ir-candidate">
                    <button
                      className="ir-card-open"
                      onClick={() => {
                        setSelectedId(c.id);
                        onNavigate("detail");
                      }}
                    >
                      <CandidateMedia candidate={c} />
                      <strong>{c.name}</strong>
                      <span>{typeLabel(c.type)}</span>
                    </button>
                    <div className="ir-card-actions">
                      <button
                        disabled={busy}
                        onClick={() => void addToWork(c.id)}
                      >
                        <Plus size={15} /> Add to work
                      </button>
                      <button
                        onClick={() => {
                          toggleCompare(c.id);
                          onNavigate("compare");
                        }}
                      >
                        Compare
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!filtered.length && (
                <div className="ir-empty" role="status">
                  <h3>No matching saved results</h3>
                  <p>Try another category, or search for something new.</p>
                  <button
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {view === "compare" && (
        <div className="ir-comparison-workspace">
          <div className="ir-comparison-toolbar">
            <div
              className="ir-compare-domains"
              role="group"
              aria-label="Comparison category"
            >
              {["all", "films", "music", "dining", "experiences"].map((tab) => (
                <button
                  key={tab}
                  aria-pressed={category === tab}
                  onClick={() => setCategory(tab)}
                >
                  {tab === "all"
                    ? "All"
                    : tab === "films"
                      ? "Films"
                      : tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <button
              className="ir-clear-comparison"
              onClick={() => {
                setComparisonIds([]);
                setComparisonEdited(true);
              }}
            >
              Clear all
            </button>
          </div>
          <div
            className="ir-compare-picker"
            role="group"
            aria-label="Choose candidates to compare"
          >
            {candidates.filter(matchesCategory).map((candidate) => (
              <button
                key={candidate.id}
                aria-pressed={comparedIds.includes(candidate.id)}
                onClick={() => toggleCompare(candidate.id)}
              >
                {comparedIds.includes(candidate.id) ? (
                  <Check size={14} />
                ) : (
                  <Plus size={14} />
                )}
                {candidate.name}
              </button>
            ))}
          </div>
          {compared.length ? (
            <div
              className="ir-matrix-scroll"
              tabIndex={0}
              aria-label="Scrollable side by side comparison"
            >
              <div
                className="ir-matrix"
                style={{
                  gridTemplateColumns: `repeat(${compared.length}, minmax(240px, 1fr))`,
                }}
              >
                {compared.map((candidate) => {
                  const signals = vm.culturalSignalsForCandidate(candidate.id);
                  const participants = task.brief.participants.filter(
                    (person) =>
                      !person.sample || task.mode === "illustrative-fixtures",
                  );

                  return (
                    <article className="ir-matrix-column" key={candidate.id}>
                      <button
                        className="ir-comparison-cover"
                        onClick={() => {
                          setSelectedId(candidate.id);
                          onNavigate("detail");
                        }}
                        aria-label={`Open details for ${candidate.name}`}
                      >
                        <CandidateMedia candidate={candidate} wide />
                        <strong>{candidate.name}</strong>
                      </button>
                      <div className="ir-comparison-people">
                        {participants.length ? (
                          participants.map((person) => {
                            const signal = signals.find(
                              (entry) => entry.participantId === person.id,
                            );

                            return (
                              <div
                                className="ir-comparison-person"
                                key={person.id}
                              >
                                <span
                                  className="ir-person-avatar"
                                  aria-hidden="true"
                                >
                                  {person.name.slice(0, 1).toUpperCase()}
                                </span>
                                <div className="ir-person-signal">
                                  <div className="ir-person-topline">
                                    <strong>{person.name}</strong>
                                    <span>
                                      {signal
                                        ? `Rank #${signal.rankWithinQuery} · ${signal.rawAffinity ?? "—"}`
                                        : "Not scored"}
                                    </span>
                                  </div>
                                  <small>
                                    {signal
                                      ? `Within Qloo query ${signal.queryId}`
                                      : person.preferences
                                          .filter((pref) => pref.confirmed)
                                          .slice(0, 2)
                                          .map((pref) => pref.value)
                                          .join(" · ") ||
                                        "No comparable taste signal"}
                                  </small>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="ir-compare-no-people">
                            <strong>Personal taste signals unavailable</strong>
                            <p>
                              Compare sourced attributes instead. Igor will not
                              invent people or affinity scores.
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="ir-compare-practical">
                        <p>
                          <span>Duration</span>
                          <strong>
                            {candidate.duration.value == null
                              ? "Unknown"
                              : candidate.duration.value + " min"}
                          </strong>
                        </p>
                        <p>
                          <span>Cost</span>
                          <strong>
                            {candidate.cost.value == null
                              ? "Unknown"
                              : candidate.cost.value +
                                " " +
                                task.brief.constraints.currency}
                          </strong>
                        </p>
                        <p>
                          <span>Availability</span>
                          <strong>
                            {candidate.available == null
                              ? "Not checked"
                              : candidate.available
                                ? "Reported available"
                                : "Reported unavailable"}
                          </strong>
                        </p>
                      </div>
                      <button
                        className="ir-compare-add"
                        disabled={busy}
                        onClick={() => void addToWork(candidate.id)}
                      >
                        <Plus size={21} /> Add to plan
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="ir-empty">
              <h3>No options selected</h3>
              <p>Select candidates above, or discover some first.</p>
            </div>
          )}
          <p className="ir-footnote">
            Qloo ranks and raw affinity values belong to individual queries.
            Missing or incomparable values are never manufactured or averaged.
          </p>
        </div>
      )}

      {view === "detail" &&
        (chosen ? (
          <div className="ir-detail-layout">
            <div className="ir-detail-main">
              <CandidateMedia candidate={chosen} wide />
              <div className="ir-detail-copy">
                <p className="ir-kicker">{typeLabel(chosen.type)}</p>
                <h3>{chosen.name}</h3>
                <p>{chosen.description}</p>
                <div className="ir-detail-actions">
                  <button
                    className="ir-primary"
                    disabled={busy}
                    onClick={() => void addToWork(chosen.id)}
                  >
                    <Plus size={18} /> Add to work
                  </button>
                  <button
                    className="ir-secondary"
                    onClick={() => {
                      toggleCompare(chosen.id);
                      onNavigate("compare");
                    }}
                  >
                    Compare
                  </button>
                </div>
              </div>
              <h4>Qloo evidence</h4>
              <CandidateSignals task={task} candidate={chosen} vm={vm} />
            </div>
            <aside className="ir-detail-sources">
              <h4>Sources and context</h4>
              {vm.evidenceForCandidate(chosen.id).length ? (
                vm
                  .evidenceForCandidate(chosen.id)
                  .map((source) => (
                    <EvidenceSource key={source.id} source={source} />
                  ))
              ) : (
                <p className="ir-subtle">
                  No source records are attached to this candidate.
                </p>
              )}
              <p className="ir-footnote">
                Any descriptive fit wording is Igor's interpretation, not a
                guaranteed Qloo explanation.
              </p>
            </aside>
          </div>
        ) : (
          <div className="ir-empty">
            No candidate details yet. Continue your conversation.
          </div>
        ))}

      {view === "plan" && (
        <div className="ir-connected-plan">
          <div className="ir-plan-byline">
            <span>
              {task.brief.participants.filter((person) => !person.sample)
                .length || "No confirmed"}{" "}
              people
            </span>
            <span>{task.brief.constraints.location || "Location TBD"}</span>
            <span>Saved revision {vm.revision}</span>
          </div>
          <nav className="ir-plan-tabs" aria-label="Plan sections">
            {(
              ["overview", "itinerary", "map", "options", "notes"] as const
            ).map((tab) => (
              <button
                key={tab}
                aria-current={planTab === tab ? "page" : undefined}
                onClick={() => setPlanTab(tab)}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
          {(planTab === "overview" || planTab === "itinerary") && (
            <div className="ir-plan-reference-grid">
              <div className="ir-plan-timeline-pane">
                {task.schedule.length ? (
                  <ol className="ir-plan-timeline">
                    {task.schedule.map((stop, index) => {
                      const candidate = stop.candidateId
                        ? vm.candidateById.get(stop.candidateId)
                        : null;

                      return (
                        <li key={index}>
                          <span className="ir-plan-time">Time TBD</span>
                          <span className="ir-plan-marker" aria-hidden="true" />
                          <button
                            className="ir-plan-event"
                            disabled={!candidate}
                            onClick={() => {
                              if (candidate) {
                                setSelectedId(candidate.id);
                                onNavigate("detail");
                              }
                            }}
                          >
                            <div className="ir-plan-thumb">
                              {candidate?.imageUrl ? (
                                <img src={candidate.imageUrl} alt="" />
                              ) : (
                                <span>{index + 1}</span>
                              )}
                            </div>
                            <div>
                              <strong>{stop.label}</strong>
                              <span>
                                {candidate?.name || "Details not confirmed"}
                              </span>
                              <small>
                                {stop.minutes} min
                                {candidate?.available == null
                                  ? " · Availability not checked"
                                  : ""}
                              </small>
                              {task.brief.participants.some(
                                (person) => !person.sample,
                              ) && (
                                <div
                                  className="ir-plan-avatars"
                                  aria-label="Plan participants"
                                >
                                  {task.brief.participants
                                    .filter((person) => !person.sample)
                                    .slice(0, 6)
                                    .map((person) => (
                                      <i key={person.id} title={person.name}>
                                        {person.name.slice(0, 1)}
                                      </i>
                                    ))}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="ir-plan-no-schedule">
                    <h3>Your work is connected.</h3>
                    <p>
                      No fixed itinerary exists for this task. The outcomes and
                      selected evidence remain available.
                    </p>
                    <div className="ir-selection-list">
                      {vm.selectedCandidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          onClick={() => {
                            setSelectedId(candidate.id);
                            onNavigate("detail");
                          }}
                        >
                          {candidate.name}
                          <ArrowRight size={17} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  className="ir-plan-add-stop"
                  disabled={busy}
                  onClick={() =>
                    void onTurn({
                      type: "message",
                      text: "Add a suitable next step to my existing plan, preserving all confirmed decisions. Ask only for any essential details.",
                    })
                  }
                >
                  <Plus size={22} /> Add a stop
                </button>
              </div>
              <aside className="ir-plan-cover">
                <div className="ir-plan-cover-art">
                  {vm.selectedCandidates[0]?.imageUrl ? (
                    <img
                      src={vm.selectedCandidates[0].imageUrl}
                      alt="Selected work cover"
                    />
                  ) : (
                    <img
                      src="/reference-art/plan-editorial-cover.webp"
                      alt=""
                      onError={(event) => {
                        event.currentTarget.src =
                          "/marketing/assets/photos/hero-dinner-a-800.webp";
                      }}
                    />
                  )}
                  <div className="ir-plan-cover-copy">
                    <strong>
                      {task.brief.goal || "An experience worth remembering."}
                    </strong>
                  </div>
                </div>
                {!vm.selectedCandidates[0]?.imageUrl && (
                  <small>
                    Illustrative cover art · not a verified venue photo
                  </small>
                )}
              </aside>
            </div>
          )}
          {planTab === "map" && (
            <div className="ir-plan-tab-panel">
              {task.canvas?.surface.nodes.some(
                (node) => node.type === "spatial",
              ) ? (
                <TaskCanvas
                  task={task}
                  busy={busy}
                  onTurn={onTurn}
                  focusNodeId={
                    task.canvas.surface.nodes.find(
                      (node) => node.type === "spatial",
                    )?.id
                  }
                />
              ) : (
                <div className="ir-empty">
                  A map becomes available when Igor has verified coordinates for
                  the places in your plan.
                </div>
              )}
            </div>
          )}
          {planTab === "options" && (
            <div className="ir-plan-tab-panel">
              <h3>Options you considered</h3>
              <div className="ir-selection-list">
                {vm.candidates
                  .filter((candidate) => !candidate.sample)
                  .map((candidate) => (
                    <button
                      key={candidate.id}
                      onClick={() => {
                        setSelectedId(candidate.id);
                        onNavigate("detail");
                      }}
                    >
                      {candidate.name}
                      <ArrowRight size={17} />
                    </button>
                  ))}
              </div>
              <button
                className="ir-secondary"
                onClick={() => onNavigate("compare")}
              >
                Compare alternatives
              </button>
            </div>
          )}
          {planTab === "notes" && (
            <div className="ir-plan-tab-panel ir-plan-notes">
              <h3>Current constraints</h3>
              <p>
                Location: <strong>{task.brief.constraints.location}</strong>
              </p>
              <p>
                Budget:{" "}
                <strong>
                  {task.brief.constraints.budget}{" "}
                  {task.brief.constraints.currency}
                </strong>
              </p>
              <p>
                Duration:{" "}
                <strong>{task.brief.constraints.duration} minutes</strong>
              </p>
              {task.brief.unresolved.length ? (
                <>
                  <h3>Still unresolved</h3>
                  {task.brief.unresolved.map((text, index) => (
                    <p key={index}>{text}</p>
                  ))}
                </>
              ) : (
                <p>No unresolved constraints recorded.</p>
              )}
              <button
                className="ir-secondary"
                onClick={() => onNavigate("revisions")}
              >
                View version history <ArrowRight size={17} />
              </button>
            </div>
          )}
        </div>
      )}

      {view === "revisions" && (
        <div className="ir-revisions">
          <div className="ir-revision-current">
            <Check size={20} />
            <div>
              <strong>Workspace revision {vm.revision}</strong>
              <p>
                Current server-saved task. Changes are only confirmed after Igor
                returns a new revision.
              </p>
            </div>
          </div>
          <h3>Recent revision receipts</h3>
          {(task.receipts || []).length ? (
            <ol className="ir-version-list">
              {[...(task.receipts || [])].reverse().map((receipt, i) => (
                <li key={receipt.inputHash + ":" + i}>
                  <span>
                    v{receipt.fromVersion} → v{receipt.toVersion}
                  </span>
                  <div>
                    <strong>{receipt.status}</strong>
                    <p>
                      {receipt.changed.length
                        ? receipt.changed.join(" · ")
                        : "No changes recorded"}
                    </p>
                    <small>{receipt.at}</small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ir-subtle">No saved revision receipts yet.</p>
          )}
          <h3>Artifact versions</h3>
          {task.artifactHistory?.length ? (
            <ol className="ir-version-list">
              {[...task.artifactHistory].reverse().map((record, i) => (
                <li
                  key={
                    record.artifact.id + ":" + record.artifact.version + ":" + i
                  }
                >
                  <span>v{record.artifact.version}</span>
                  <div>
                    <strong>{record.artifact.title}</strong>
                    <p>{record.reason}</p>
                    <details>
                      <summary>
                        Inspect saved content <ChevronDown size={15} />
                      </summary>
                      <pre>{record.artifact.content}</pre>
                    </details>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ir-subtle">
              No previous artifact versions saved. The current draft remains
              available in Create.
            </p>
          )}
          <p className="ir-footnote">
            Restoring a version is not offered until a version-restore mutation
            is supported by the server. Ask Igor to revise a specific item in
            the conversation.
          </p>
        </div>
      )}

      {view === "maps" && (
        <>
          <p className="ir-footnote">
            {vm.mapPlaces.length} verified map{" "}
            {vm.mapPlaces.length === 1 ? "location" : "locations"} in this task.
            No pin is created for an illustrative or unlocated place.
          </p>
          {task.canvas?.surface.nodes.some((n) => n.type === "spatial") ? (
            <TaskCanvas
              task={task}
              busy={busy}
              onTurn={onTurn}
              focusNodeId={
                task.canvas.surface.nodes.find((n) => n.type === "spatial")!.id
              }
            />
          ) : (
            <div className="ir-empty">
              <MapPin size={25} />
              <h3>No spatial surface available</h3>
              <p>
                Ask Igor to find geocoded places. Your other work stays
                accessible.
              </p>
            </div>
          )}
          <div className="ir-selection-list">
            {vm.mapPlaces.map(({ candidate }) => (
              <button
                key={candidate.id}
                onClick={() => {
                  setSelectedId(candidate.id);
                  onNavigate("detail");
                }}
              >
                {candidate.name} <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
