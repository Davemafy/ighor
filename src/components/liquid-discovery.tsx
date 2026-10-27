"use client";

import { ArrowLeft, ArrowRight, Check, GitCompareArrows, ListChecks, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Task, TaskAction } from "@/core/contracts";
import type { CanvasMutation, PresentationNode } from "@/core/presentation";

type DiscoveryNode = Extract<PresentationNode, { type: "discovery" | "spatial" }>;
type Candidate = Task["candidates"][number];

function EvidenceNote({ candidate, task }: { candidate: Candidate; task: Task }) {
  const evidence = candidate.evidenceIds
    .map((key) => task.evidence.find((record) => record.id === key))
    .filter((record) => record && record.freshness === "current");
  if (!evidence.length) {
    return <p className="iw-liquid-uncertain">No inspectable cultural evidence for this option.</p>;
  }

  return (
    <details className="iw-liquid-evidence">
      <summary>Why this option? <span>{evidence.length} source{evidence.length === 1 ? "" : "s"}</span></summary>
      <div className="iw-liquid-evidence-list">
        {evidence.map((record) => (
          <div key={record!.id}>
            <strong>{record!.source === "provider-returned" ? "Qloo evidence" : record!.source.replaceAll("-", " ")}</strong>
            <p>{record!.summary}</p>
            {record!.limitations.length > 0 && <small>{record!.limitations.join("; ")}</small>}
            <small>{record!.delivery === "LIVE" ? "Live provider response" : record!.delivery === "CACHED" ? "Cached provider response" : "Source recorded with the task"}</small>
          </div>
        ))}
      </div>
    </details>
  );
}

function OptionCard({
  candidate, task, actions, compact = false,
}: {
  candidate: Candidate;
  task: Task;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const safeId = candidate.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  return (
    <article className={"iw-liquid-card" + (compact ? " iw-liquid-card-compact" : "")} style={{ viewTransitionName: "igor-candidate-" + safeId }}>
      {candidate.imageUrl && <img className="iw-liquid-image" alt="" src={candidate.imageUrl} loading="lazy" />}
      <div className="iw-liquid-card-body">
        <small>{candidate.type.replaceAll("_", " ")}{candidate.location ? " · " + candidate.location : ""}</small>
        <h4>{candidate.name}</h4>
        <p>{candidate.description}</p>
        {candidate.fitReason && <p className="iw-liquid-reason">{candidate.fitReason}</p>}
        {candidate.cost.value !== null && <p className="iw-liquid-uncertain">Cost information: {candidate.cost.value} ({candidate.cost.source.replaceAll("-", " ")}; verify currency and availability)</p>}
        <EvidenceNote candidate={candidate} task={task} />
        {actions && <div className="iw-liquid-actions">{actions}</div>}
      </div>
    </article>
  );
}

/** Real, owner-scoped transitions: only prevalidated candidates and mutations reach this UI. */
export function LiquidDiscovery({
  task, node, busy, mutate, onTurn,
}: {
  task: Task;
  node: DiscoveryNode;
  busy: boolean;
  mutate: (mutation: CanvasMutation) => void;
  onTurn: (action: TaskAction) => void;
}) {
  const canvas = task.canvas;
  const available = node.candidateIds
    .map((key) => task.candidates.find((candidate) => candidate.id === key && candidate.freshness === "current"))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  const compare = available.filter((candidate) => canvas?.comparisonIds.includes(candidate.id));
  const selected = available.find((candidate) => candidate.id === canvas?.selectedCandidateId);
  const plan = (canvas?.itineraryIds ?? [])
    .map((key) => available.find((candidate) => candidate.id === key))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  const mode = canvas?.viewModes[node.id] ?? "explore";
  const entityNames = new Map(
    task.entities
      .filter((entity) => Boolean(entity.providerId))
      .map((entity) => [entity.providerId!, entity.name]),
  );
  const culturalConnections = available.flatMap((candidate) =>
    candidate.evidenceIds.some((key) => task.evidence.some((record) =>
      record.id === key && record.source === "provider-returned" && record.freshness === "current"
    ))
      ? Object.entries(candidate.cultural ?? {}).flatMap(([profileId, signal]) =>
          signal.seedIds.map((seedId) => ({ candidate, profileId, signal, seedId }))
        )
      : [],
  );
  const setMode = (next: "explore" | "connections" | "compare" | "plan") => mutate({ operation: "view", nodeId: node.id, mode: next });

  return (
    <div className="iw-liquid" data-mode={mode} aria-label="Interactive connected discovery">
      <div className="iw-liquid-toolbar" aria-label="Workspace view">
        <button type="button" aria-pressed={mode === "explore"} disabled={busy} onClick={() => setMode("explore")}>Explore</button>
        <button type="button" aria-pressed={mode === "connections"} disabled={busy || culturalConnections.length === 0} onClick={() => setMode("connections")}>
          Connections {culturalConnections.length > 0 ? "(" + culturalConnections.length + ")" : ""}
        </button>
        <button type="button" aria-pressed={mode === "compare"} disabled={busy || compare.length < 2} onClick={() => setMode("compare")}>
          <GitCompareArrows aria-hidden="true" /> Compare {compare.length > 0 ? "(" + compare.length + ")" : ""}
        </button>
        <button type="button" aria-pressed={mode === "plan"} disabled={busy || !selected} onClick={() => setMode("plan")}><ListChecks aria-hidden="true" /> Shape a plan</button>
      </div>
      <div className="iw-liquid-intro" aria-live="polite">
        <strong>{mode === "explore" ? "Explore the possibilities" : mode === "connections" ? "Trace the cultural connections" : mode === "compare" ? "Look closer" : "Shape the next step"}</strong>
        <p>{mode === "explore" ? "Choose an option for your plan, or select two to compare. These are proposals, not confirmed bookings." :
          mode === "connections" ? "These links display Qloo query seeds and returned candidates. They are not proof of personal relevance or causation." :
          mode === "compare" ? "Compare the same grounded results. Evidence and unknown practical facts remain visible." :
          "Your own selections are saved here. Assign days, add or remove stops, or ask Igor to turn them into a draft."}</p>
      </div>
      {mode === "explore" && (
        <div className="iw-liquid-grid">
          {available.map((candidate) => (
            <OptionCard key={candidate.id} candidate={candidate} task={task} actions={
              <>
                <button type="button" disabled={busy} aria-pressed={selected?.id === candidate.id}
                  onClick={() => mutate({ operation: "select", nodeId: node.id, candidateId: candidate.id })}>
                  {selected?.id === candidate.id ? <Check aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                  {selected?.id === candidate.id ? "Chosen for plan" : "Choose"}
                </button>
                <button type="button" disabled={busy} aria-pressed={compare.some((item) => item.id === candidate.id)}
                  onClick={() => mutate({ operation: "compare-selection", nodeId: node.id, candidateId: candidate.id })}>
                  <GitCompareArrows aria-hidden="true" />
                  {compare.some((item) => item.id === candidate.id) ? "In comparison" : "Compare"}
                </button>
              </>
            } />
          ))}
        </div>
      )}
      {mode === "connections" && (
        <div className="iw-liquid-connections">
          <button type="button" className="iw-liquid-back" disabled={busy} onClick={() => setMode("explore")}><ArrowLeft aria-hidden="true" /> All options</button>
          <div className="iw-liquid-paths">
            {culturalConnections.map(({ candidate, seedId, signal, profileId }, index) => (
              <article className="iw-liquid-path" key={candidate.id + ":" + profileId + ":" + signal.queryId + ":" + seedId + ":" + index}>
                <div className="iw-liquid-path-pair">
                  <span className="iw-liquid-origin">{entityNames.get(seedId) ?? "Query seed: " + seedId}</span>
                  <ArrowRight aria-hidden="true" />
                  <strong>{candidate.name}</strong>
                </div>
                <div className="iw-liquid-path-meta">
                  <span>Rank {signal.rank} within this query</span>
                  <span>{signal.delivery === "LIVE" ? "Live" : "Cached"} Qloo result</span>
                </div>
                <small>Query ID: {signal.queryId}</small>
                <EvidenceNote candidate={candidate} task={task} />
              </article>
            ))}
          </div>
          {culturalConnections.length === 0 && <p className="iw-liquid-uncertain">No traceable Qloo connection is available for these options yet. Igor cannot draw an unsupported cultural relationship.</p>}
        </div>
      )}
      {mode === "compare" && (
        <div className="iw-liquid-compare">
          <button type="button" className="iw-liquid-back" disabled={busy} onClick={() => setMode("explore")}><ArrowLeft aria-hidden="true" /> All options</button>
          <div className="iw-liquid-compare-grid">
            {compare.map((candidate) => (
              <OptionCard key={candidate.id} candidate={candidate} task={task} compact actions={
                <button type="button" disabled={busy} aria-pressed={selected?.id === candidate.id}
                  onClick={() => mutate({ operation: "select", nodeId: node.id, candidateId: candidate.id })}>
                  {selected?.id === candidate.id ? <Check aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                  {selected?.id === candidate.id ? "Chosen" : "Use this"}
                </button>
              } />
            ))}
          </div>
        </div>
      )}
      {mode === "plan" && (
        <div className="iw-liquid-plan">
          <button type="button" className="iw-liquid-back" disabled={busy} onClick={() => setMode("explore")}><ArrowLeft aria-hidden="true" /> Discover more</button>
          <ol>
            {plan.map((candidate, index) => (
              <li key={candidate.id} style={{ viewTransitionName: "igor-plan-" + candidate.id.replace(/[^a-zA-Z0-9_-]/g, "-") }}>
                <span className="iw-liquid-plan-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{candidate.name}</strong>
                  <p>{candidate.description}</p>
                  <EvidenceNote candidate={candidate} task={task} />
                  <label>Day
                    <select disabled={busy} aria-label={"Day for " + candidate.name}
                      value={canvas?.itineraryDays[candidate.id] ?? 0}
                      onChange={(event) => mutate({ operation: "itinerary-day", nodeId: node.id, candidateId: candidate.id, day: Number(event.target.value) })}>
                      <option value={0}>Unscheduled</option>
                      {Array.from({ length: 14 }, (_, day) => <option key={day} value={day + 1}>Day {day + 1}</option>)}
                    </select>
                  </label>
                </div>
                <button type="button" disabled={busy} aria-label={"Remove " + candidate.name + " from plan"} onClick={() =>
                  mutate({ operation: "itinerary", nodeId: node.id, candidateIds: plan.filter((item) => item.id !== candidate.id).map((item) => item.id) })}>
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          {!plan.length && <p className="iw-liquid-uncertain">Your plan is empty. Return to Explore to choose an option.</p>}
          {available.filter((candidate) => !plan.some((item) => item.id === candidate.id)).length > 0 && (
            <div className="iw-liquid-add">
              <p>Add another option</p>
              {available.filter((candidate) => !plan.some((item) => item.id === candidate.id)).map((candidate) => (
                <button key={candidate.id} type="button" disabled={busy}
                  onClick={() => mutate({ operation: "itinerary", nodeId: node.id, candidateIds: [...plan.map((item) => item.id), candidate.id] })}>
                  <Plus aria-hidden="true" /> {candidate.name}
                </button>
              ))}
            </div>
          )}
          <p className="iw-liquid-uncertain">This is a planning shortlist, not confirmed availability, pricing, routing or reservations.</p>
          {!!plan.length && <button type="button" className="iw-liquid-draft" disabled={busy}
            onClick={() => onTurn({
              type: "message",
              text: "Use the saved selections in this conversation to draft an actionable plan, respecting my confirmed preferences and constraints. Keep unknown prices, travel times and availability explicitly unverified. Preserve any approved work.",
            })}>
            Draft a plan with Igor <ArrowRight aria-hidden="true" />
          </button>}
        </div>
      )}
    </div>
  );
}
