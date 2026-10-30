"use client";

import { useMemo, useState } from "react";
import type { Task, TaskAction } from "@/core/contracts";
import { projectWorkspace } from "@/core/workspace-snapshot";
import { adaptWorkspaceSnapshot, type WorkspaceCandidate } from "./workspace-view-model";
import { ArrowRight, Check, ChevronDown, MapPin, Plus, Search } from "lucide-react";
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
  value == null ? "Not checked" : Number.isFinite(value) ? String(value) : "Not checked";

function CandidateMedia({ candidate, wide = false }: { candidate: Candidate; wide?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`ir-media ${wide ? "ir-media-wide" : ""}`}>
      {candidate.imageUrl && !broken ? (
        <img src={candidate.imageUrl} alt={candidate.name} loading="lazy"
          referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <div className="ir-media-fallback" role="img" aria-label={`No verified image for ${candidate.name}`}>
          <span>{typeLabel(candidate.type)}</span>
          <strong>{candidate.name}</strong>
        </div>
      )}
    </div>
  );
}
function EvidenceSource({ source }: { source: Task["evidence"][number] }) {
  const url = source.reference.startsWith("https://") && source.source === "provider-returned" ? source.reference : null;
  return (
    <article className="ir-evidence" key={source.id}>
      <div className="ir-source-head">
        <strong>{source.title || (source.kind === "cultural" ? "Qloo cultural evidence" : "Source record")}</strong>
        <span>{source.delivery || source.source} · {source.freshness}</span>
      </div>
      <p>{source.summary}</p>
      <small>Retrieved {Number.isFinite(Date.parse(source.at)) ? new Date(source.at).toLocaleDateString() : "date unknown"}</small>
      {source.explanation && <p>{source.explanation}</p>}
      {!!source.limitations.length && <p className="ir-subtle">{source.limitations.join(" · ")}</p>}
      {url && <a href={url} target="_blank" rel="noopener noreferrer">Open source <ArrowRight size={15} /></a>}
    </article>
  );
}

function CandidateSignals({ task, candidate }: { task: Task; candidate: Candidate }) {
  const vm = adaptWorkspaceSnapshot(projectWorkspace(task));
  const signals = vm.culturalSignalsForCandidate(candidate.id);
  const sampleIds = new Set(task.brief.participants.filter((p) => p.sample).map((p) => p.id));
  return (
    <div className="ir-signals">
      {!signals.length && <p className="ir-subtle">No Qloo cultural signal returned for this candidate.</p>}
      {signals.map((signal) => (
        <div className="ir-signal" key={signal.key + ":" + signal.queryId}>
          <div className="ir-signal-top">
            <strong>{signal.participantName ? `${sampleIds.has(signal.participantId || "") ? "Illustrative profile · " : ""}${signal.participantName}` : (signal.scope === "context" ? "Context query" : "Unattributed query")}</strong>
            <span>{signal.delivery}</span>
          </div>
          <p>Rank #{signal.rankWithinQuery} <span>within query {signal.queryId}</span></p>
          <p>Raw affinity {signal.rawAffinity == null ? "not returned" : signal.rawAffinity}</p>
          <small>Seeds: {signal.seedIds.length ? signal.seedIds.join(", ") : "Not supplied"}</small>
          <small>{signal.explanationScope === "recommendation"
            ? "Per-result contributors"
            : signal.explanationScope === "aggregate-query" ? "Aggregate-query contributors, not a personal explanation"
              : "No per-result explanation returned"} · {signal.retrievedAt}</small>
        </div>
      ))}
    </div>
  );
}

export function ReferenceWork({ task, view, busy, onTurn, onNavigate }: Props) {
  const vm = useMemo(() => adaptWorkspaceSnapshot(projectWorkspace(task)), [task]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const candidates = vm.candidates.filter((c) => !c.sample && (!("freshness" in c) || c.freshness === "current"));
  const categories = ["all", ...new Set(candidates.map((c) => c.type))];
  const filtered = candidates.filter((c) =>
    (category === "all" || c.type === category) &&
    [c.name, c.description, ...c.tags].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  const chosen = (selectedId && vm.candidateById.get(selectedId)) || filtered[0] || candidates[0];
  const comparedIds = comparisonIds.length ? comparisonIds : task.canvas?.comparisonIds.length
    ? task.canvas.comparisonIds : task.brief.selected.length ? task.brief.selected : candidates.slice(0, 3).map((c) => c.id);
  const compared = comparedIds.map((id) => vm.candidateById.get(id)).filter((c): c is Candidate => !!c);
  const proposalNode = task.canvas?.surface.nodes.find((node) => (node.type === "discovery" || node.type === "spatial") && node.candidateIds.length > 0);

  async function addToWork(id: string) {
    const canEditItinerary = !!proposalNode && !!task.canvas &&
      proposalNode.candidateIds.includes(id) &&
      task.candidates.some((candidate) => candidate.id === id && candidate.freshness === "current");
    if (canEditItinerary && task.canvas && proposalNode) {
      const candidateIds = [...new Set([...task.canvas.itineraryIds, id])];
      await onTurn({ type: "canvas", surfaceId: task.canvas.surface.id,
        mutation: { operation: "itinerary", nodeId: proposalNode.id, candidateIds } });
    } else {
      // A canvas 'select' only changes visual focus: it does NOT add to a plan.
      // Route unsupported structural changes through the authoritative engine.
      await onTurn({ type: "message", text: `Add the existing candidate with ID ${id} to my current work. Preserve unrelated selections and return the updated work.` });
    }
  }
  function toggleCompare(id: string) {
    setComparisonIds((old) => old.includes(id) ? old.filter((entry) => entry !== id) : old.length >= 4 ? old : [...old, id]);
  }
  const heading = view === "discover" ? "Explore" : view === "compare" ? "Compare" :
    view === "plan" ? task.brief.goal || "Connected work" :
      view === "maps" ? "Places in context" : view === "revisions" ? "Changes & versions" : chosen?.name || "Details";
  const subtitle = view === "discover" ? "Discover what your work has actually found." :
    view === "compare" ? "Evidence side by side, without invented compatibility scores." :
      view === "plan" ? "One connected outcome, with its constraints and open decisions." :
        view === "maps" ? "Only provider-grounded places appear on the map." :
          view === "revisions" ? "Every change linked to the saved task revision." : "Source details and limitations";

  return (
    <section className={`ir-surface ir-${view}`} aria-label={heading}>
      {task.mode === "illustrative-fixtures" && <p className="ir-demo-note" role="status">Illustrative development data · not live Qloo or verified availability</p>}
      <header className="ir-heading">
        <div><h2>{heading}</h2><p>{subtitle}</p></div>
        {view === "detail" && <button className="ir-secondary" onClick={() => onNavigate("discover")}><ArrowRight size={17} /> Back to explore</button>}
      </header>

      {view === "discover" && (
        <>
          <label className="ir-search"><Search size={19} /><span className="ir-sr">Search real discovered candidates</span>
            <input type="search" placeholder="Search discovered films, music, places, ideas…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <div className="ir-chip-row" role="group" aria-label="Discovery categories">
            {categories.map((cat) => <button key={cat} aria-pressed={category === cat} onClick={() => setCategory(cat)}>{cat === "all" ? "All" : typeLabel(cat)}</button>)}
          </div>
          <div className="ir-section-line"><h3>From your conversation</h3><span>{filtered.length} grounded {filtered.length === 1 ? "result" : "results"}</span></div>
          <div className="ir-gallery">
            {filtered.map((c) => (
              <article key={c.id} className="ir-candidate">
                <button className="ir-card-open" onClick={() => {setSelectedId(c.id); onNavigate("detail");}}>
                  <CandidateMedia candidate={c} /><strong>{c.name}</strong><span>{typeLabel(c.type)}</span>
                </button>
                <div className="ir-card-actions">
                  <button disabled={busy} onClick={() => void addToWork(c.id)}><Plus size={15}/> Add to work</button>
                  <button onClick={() => {toggleCompare(c.id); onNavigate("compare");}}>Compare</button>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && <div className="ir-empty" role="status"><h3>No matching saved results</h3>
            <p>Try another category, or ask Igor to research a new direction in the conversation.</p>
            <button onClick={() => {setQuery("");setCategory("all");}}>Clear filters</button></div>}
        </>
      )}

      {view === "compare" && (
        <>
          <div className="ir-compare-picker" role="group" aria-label="Choose candidates to compare">
            {candidates.map((c) => <button key={c.id} aria-pressed={comparedIds.includes(c.id)}
              onClick={() => toggleCompare(c.id)}>{comparedIds.includes(c.id) ? <Check size={14}/> : <Plus size={14}/>} {c.name}</button>)}
          </div>
          {compared.length ? (
            <div className="ir-matrix-scroll" tabIndex={0} aria-label="Scrollable candidate comparison">
              <div className="ir-matrix" style={{gridTemplateColumns: `repeat(${compared.length}, minmax(220px, 1fr))`}}>
                {compared.map((c) => <article className="ir-matrix-column" key={c.id}>
                  <button className="ir-card-open" onClick={() => {setSelectedId(c.id);onNavigate("detail");}}>
                    <CandidateMedia candidate={c} wide/><strong>{c.name}</strong><span>{typeLabel(c.type)}</span>
                  </button>
                  <div className="ir-matrix-metric"><small>Practical constraints</small>
                    <p>Cost · {fact(c.cost.value)} {task.brief.constraints.currency}</p>
                    <p>Duration · {c.duration.value == null ? "Not checked" : c.duration.value + " min"}</p>
                    <p>Availability · {c.available == null ? "Not checked" : c.available ? "Reported available" : "Reported unavailable"}</p>
                  </div>
                  <div className="ir-matrix-metric"><small>People and query-scoped evidence</small>
                    <CandidateSignals task={task} candidate={c}/>
                  </div>
                  <div className="ir-matrix-metric"><small>Sources</small>
                    {vm.evidenceForCandidate(c.id).length ? vm.evidenceForCandidate(c.id).map((s) => <p key={s.id}>{s.title || s.summary.slice(0, 80)}</p>)
                      : <p>None returned</p>}
                  </div>
                  <button className="ir-primary" disabled={busy} onClick={() => void addToWork(c.id)}><Plus size={17}/> Add to work</button>
                </article>)}
              </div>
            </div>
          ) : <div className="ir-empty">No comparable candidates. Open Explore to begin.</div>}
          <p className="ir-footnote">Ranks are within each returned Qloo query. Raw affinities from different queries are not comparable and are never averaged here.</p>
        </>
      )}

      {view === "detail" && (chosen ? (
        <div className="ir-detail-layout">
          <div className="ir-detail-main">
            <CandidateMedia candidate={chosen} wide />
            <div className="ir-detail-copy">
              <p className="ir-kicker">{typeLabel(chosen.type)}</p>
              <h3>{chosen.name}</h3><p>{chosen.description}</p>
              <div className="ir-detail-actions">
                <button className="ir-primary" disabled={busy} onClick={() => void addToWork(chosen.id)}><Plus size={18}/> Add to work</button>
                <button className="ir-secondary" onClick={() => {toggleCompare(chosen.id);onNavigate("compare");}}>Compare</button>
              </div>
            </div>
            <h4>Qloo evidence</h4><CandidateSignals task={task} candidate={chosen}/>
          </div>
          <aside className="ir-detail-sources">
            <h4>Sources and context</h4>
            {vm.evidenceForCandidate(chosen.id).length ?
              vm.evidenceForCandidate(chosen.id).map((source) => <EvidenceSource key={source.id} source={source}/>) :
              <p className="ir-subtle">No source records are attached to this candidate.</p>}
            <p className="ir-footnote">Any descriptive fit wording is Igor's interpretation, not a guaranteed Qloo explanation.</p>
          </aside>
        </div>
      ) : <div className="ir-empty">No candidate details yet. Continue your conversation.</div>)}

      {view === "plan" && (
        <div className="ir-plan-layout">
          <div>
            <div className="ir-kicker">Connected to workspace revision {vm.revision}</div>
            {task.schedule.length ? <ol className="ir-timeline">
              {task.schedule.map((stop, index) => <li key={index}>
                <span className="ir-time">{stop.minutes} min</span>
                <span className="ir-dot" aria-hidden="true"/>
                <div><strong>{stop.label}</strong><p>{stop.candidateId ? vm.candidateById.get(stop.candidateId)?.name || "Candidate unavailable" : "No linked candidate"}</p></div>
              </li>)}</ol> :
              <div className="ir-empty"><h3>No timeline saved</h3><p>This task may be research, analysis or creation rather than an event. Its actual work remains in the workspace documents and canvas.</p></div>}
            <h3>Selected and planned objects</h3>
            <div className="ir-selection-list">{[...new Set([...vm.selectedIds, ...(task.canvas?.itineraryIds || [])])].map((id) => {
              const candidate = vm.candidateById.get(id);
              return candidate ? <button key={id} onClick={() => {setSelectedId(id);onNavigate("detail");}}>{candidate.name}<ArrowRight size={16}/></button> : null;
            })}</div>
            {!vm.selectedIds.length && !task.canvas?.itineraryIds.length && <p className="ir-subtle">No confirmed candidate selections yet.</p>}
          </div>
          <aside className="ir-constraint-panel">
            <h3>Current constraints</h3>
            <p>Location <strong>{task.brief.constraints.location}</strong></p>
            <p>Budget <strong>{task.brief.constraints.budget} {task.brief.constraints.currency}</strong></p>
            <p>Duration <strong>{task.brief.constraints.duration} minutes</strong></p>
            {!!task.brief.unresolved.length && <><h4>Still unresolved</h4>{task.brief.unresolved.map((x, i) => <p key={i}>{x}</p>)}</>}
            <button className="ir-secondary" onClick={() => onNavigate("revisions")}>View versions <ArrowRight size={16}/></button>
          </aside>
        </div>
      )}

      {view === "revisions" && (
        <div className="ir-revisions">
          <div className="ir-revision-current"><Check size={20}/><div><strong>Workspace revision {vm.revision}</strong><p>Current server-saved task. Changes are only confirmed after Igor returns a new revision.</p></div></div>
          <h3>Recent revision receipts</h3>
          {(task.receipts || []).length ? <ol className="ir-version-list">{[...(task.receipts || [])].reverse().map((receipt, i) =>
            <li key={receipt.inputHash + ":" + i}>
              <span>v{receipt.fromVersion} → v{receipt.toVersion}</span>
              <div><strong>{receipt.status}</strong><p>{receipt.changed.length ? receipt.changed.join(" · ") : "No changes recorded"}</p>
              <small>{receipt.at}</small></div>
            </li>)}</ol> : <p className="ir-subtle">No saved revision receipts yet.</p>}
          <h3>Artifact versions</h3>
          {task.artifactHistory?.length ? <ol className="ir-version-list">{[...task.artifactHistory].reverse().map((record, i) =>
            <li key={record.artifact.id + ":" + record.artifact.version + ":" + i}><span>v{record.artifact.version}</span>
              <div><strong>{record.artifact.title}</strong><p>{record.reason}</p><details><summary>Inspect saved content <ChevronDown size={15}/></summary><pre>{record.artifact.content}</pre></details></div></li>)}</ol> :
            <p className="ir-subtle">No previous artifact versions saved. The current draft remains available in Create.</p>}
          <p className="ir-footnote">Restoring a version is not offered until a version-restore mutation is supported by the server. Ask Igor to revise a specific item in the conversation.</p>
        </div>
      )}

      {view === "maps" && (
        <>
          <p className="ir-footnote">{vm.mapPlaces.length} verified map {vm.mapPlaces.length === 1 ? "location" : "locations"} in this task. No pin is created for an illustrative or unlocated place.</p>
          {task.canvas?.surface.nodes.some((n) => n.type === "spatial") ? (
            <TaskCanvas task={task} busy={busy} onTurn={onTurn} focusNodeId={task.canvas.surface.nodes.find((n) => n.type === "spatial")!.id}/>
          ) : <div className="ir-empty"><MapPin size={25}/><h3>No spatial surface available</h3><p>Ask Igor to find geocoded places. Your other work stays accessible.</p></div>}
          <div className="ir-selection-list">{vm.mapPlaces.map(({candidate}) => <button key={candidate.id} onClick={() => {setSelectedId(candidate.id); onNavigate("detail");}}>
            {candidate.name} <ArrowRight size={16}/></button>)}</div>
        </>
      )}
    </section>
  );
}
