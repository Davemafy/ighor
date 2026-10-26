"use client";

import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Expand,
  FileText,
  MapPin,
  Minimize,
  Save,
  Search,
} from "lucide-react";
import type { Task, TaskAction } from "@/core/contracts";
import {
  PresentationSchema,
  type CanvasMutation,
  type Presentation,
  type PresentationNode,
} from "@/core/presentation";
import { ProductText } from "./product-surfaces";
import { morphLayout } from "./mobile-transitions";

const SpatialCanvas = lazy(() => import("./igor-spatial-canvas"));
type Props = {
  task: Task;
  busy: boolean;
  onTurn: (action: TaskAction) => void;
};
const basisLabel = {
  "general-knowledge": "General knowledge · current facts need verification",
  "user-supplied": "From the information you supplied",
  "retrieved-evidence": "From evidence in this conversation",
  draft: "Working draft",
};

export function TaskCanvas({ task, busy, onTurn }: Props) {
  const [full, setFull] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const canvas = task.canvas;
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFull(false);
      }
    };

    window.addEventListener("keydown", close);

    return () => window.removeEventListener("keydown", close);
  }, []);

  if (!canvas) {
    return null;
  }

  const surface = historyId
    ? canvas.previous.find((s) => s.id === historyId) || canvas.surface
    : canvas.surface;
  const valid = PresentationSchema.safeParse(surface);
  const readOnly = busy || surface !== canvas.surface;

  const mutate = (mutation: CanvasMutation) => {
    if (!readOnly) {
      onTurn({ type: "canvas", surfaceId: surface.id, mutation });
    }
  };

  return (
    <aside
      className={`ic-canvas ${full ? "ic-fullscreen" : ""}`}
      style={{ viewTransitionName: "igor-task-canvas" }}
      aria-label="Task canvas"
      aria-busy={busy}
    >
      <header className="ic-canvas-header">
        <div>
          <span className="ic-eyebrow">Your work, taking shape</span>
          <h2>{surface.title}</h2>
        </div>
        <button
          onClick={() => morphLayout(() => setFull(!full))}
          aria-label={full ? "Exit full screen canvas" : "Expand canvas"}
        >
          {full ? <Minimize /> : <Expand />}
        </button>
      </header>
      <div className="ic-canvas-meta">
        <span>{basisLabel[surface.basis]}</span>
        {busy && <span role="status">Updating with Igor</span>}
      </div>
      {canvas.previous.length > 0 && (
        <label className="ic-version">
          Work history
          <select
            value={historyId || ""}
            onChange={(e) => setHistoryId(e.target.value || null)}
          >
            <option value="">Current work</option>
            {canvas.previous.map((s, i) => (
              <option key={s.id + i} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {historyId && (
        <p className="ic-note">
          Previous work is preserved for reference. Return to current work to
          edit.
        </p>
      )}
      {valid.success ? (
        <CanvasTree
          surface={valid.data}
          task={task}
          busy={readOnly}
          mutate={mutate}
          onTurn={onTurn}
        />
      ) : (
        <p>
          Igor’s reply is available in your conversation. This layout could not
          be displayed.
        </p>
      )}
      <footer className="ic-canvas-footer">
        <Check /> Saved with this conversation. Ask Igor for a change.
      </footer>
    </aside>
  );
}

function CanvasTree({
  surface,
  task,
  busy,
  mutate,
  onTurn,
}: {
  surface: Presentation;
  task: Task;
  busy: boolean;
  mutate: (m: CanvasMutation) => void;
  onTurn: Props["onTurn"];
}) {
  function render(id: string): ReactNode {
    const node = surface.nodes.find((n) => n.id === id);

    if (!node) {
      return null;
    }

    if (node.type === "stack" || node.type === "columns") {
      return (
        <div key={id} className={`ic-${node.type}`}>
          {node.title && <h3>{node.title}</h3>}
          {node.children.map(render)}
        </div>
      );
    }

    if (node.type === "tabs") {
      return (
        <CanvasTabs key={id} node={node} surface={surface} render={render} />
      );
    }

    const heading = node.title && <h3>{node.title}</h3>;
    let body: ReactNode;

    switch (node.type) {
      case "text":
        body = <ProductText text={node.text} />;
        break;
      case "findings":
        body = (
          <ol className="ic-findings">
            {node.items.map((item, i) => (
              <li key={i}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <ProductText text={item.text} />
                  <Sources ids={item.evidenceIds} task={task} />
                </div>
              </li>
            ))}
          </ol>
        );
        break;
      case "sources":
        body = <Sources ids={node.evidenceIds} task={task} expanded />;
        break;
      case "table":
        body = (
          <DataTable
            node={node}
            filter={task.canvas?.filters[node.id] || ""}
            busy={busy}
            mutate={mutate}
            task={task}
          />
        );
        break;

      case "chart": {
        const table = surface.nodes.find((n) => n.id === node.tableId);

        if (table?.type !== "table") {
          break;
        }

        const filter = task.canvas?.filters[table.id]?.toLowerCase() || "";
        const rows = table.rows.filter((r) =>
          r.cells.join(" ").toLowerCase().includes(filter),
        );
        const numericColumns = table.columns
          .map((_, index) => index)
          .filter((index) =>
            index !== node.labelColumn &&
            table.rows.length > 0 &&
            table.rows.every((r) =>
              Boolean(r.cells[index]?.trim()) &&
              Number.isFinite(Number(r.cells[index])),
            ),
          );
        const candidateColumn = task.canvas?.chartAxes?.[node.id] ??
          node.valueColumn;
        const valueColumn = numericColumns.includes(candidateColumn)
          ? candidateColumn
          : node.valueColumn;
        const unit = valueColumn === node.valueColumn ? node.unit : "";
        const max = Math.max(
          ...rows.map((r) => Math.abs(Number(r.cells[valueColumn]))),
          1,
        );
        body = (
          <figure
            className="ic-chart"
            aria-label={node.title || "Data comparison"}
          >
            {numericColumns.length > 1 && (
              <label className="ic-chart-measure">
                Compare by
                <select
                  value={valueColumn}
                  disabled={busy}
                  aria-label={`Comparison measure for ${node.title || "chart"}`}
                  onChange={(event) =>
                    mutate({
                      operation: "chart-axis",
                      nodeId: node.id,
                      valueColumn: Number(event.target.value),
                    })
                  }
                >
                  {numericColumns.map((index) => (
                    <option key={index} value={index}>
                      {table.columns[index]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {rows.map((r) => (
              <div key={r.id}>
                <span>{r.cells[node.labelColumn]}</span>
                <div className="ic-bar-track">
                  <span
                    style={{
                      width: `${(Math.abs(Number(r.cells[valueColumn])) / max) * 100}%`,
                    }}
                  />
                </div>
                <strong>
                  {r.cells[valueColumn]} {unit}
                </strong>
              </div>
            ))}
            <figcaption>
              Values from {table.title || "the table"}. Filters and selected
              measures use the same stored comparison data.
            </figcaption>
          </figure>
        );
        break;
      }

      case "document":
        body = (
          <CanvasDocument
            key={`${task.id}:${surface.id}:${node.id}`}
            node={node}
            task={task}
            busy={busy}
            mutate={mutate}
            onTurn={onTurn}
          />
        );
        break;
      case "timeline":
        body = (
          <ol className="ic-timeline">
            {node.items.map((item, i) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={
                      task.canvas?.completed.includes(
                        `${node.id}:${item.id}`,
                      ) || false
                    }
                    onChange={() =>
                      mutate({
                        operation: "toggle",
                        nodeId: node.id,
                        itemId: item.id,
                      })
                    }
                  />
                  <span>
                    <strong>{item.label}</strong>
                    <ProductText text={item.detail} />
                  </span>
                </label>
                <div className="ic-order">
                  <button
                    disabled={busy || i === 0}
                    aria-label={`Move ${item.label} earlier`}
                    onClick={() => {
                      const ids = node.items.map((x) => x.id);
                      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                      mutate({
                        operation: "reorder",
                        nodeId: node.id,
                        itemIds: ids,
                      });
                    }}
                  >
                    <ArrowUp />
                  </button>
                  <button
                    disabled={busy || i === node.items.length - 1}
                    aria-label={`Move ${item.label} later`}
                    onClick={() => {
                      const ids = node.items.map((x) => x.id);
                      [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                      mutate({
                        operation: "reorder",
                        nodeId: node.id,
                        itemIds: ids,
                      });
                    }}
                  >
                    <ArrowDown />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        );
        break;
      case "discovery":
        body = (
          <div className="ic-discoveries">
            {node.candidateIds
              .map((key) => task.candidates.find((c) => c.id === key))
              .filter((c) => !!c)
              .map((c) => (
                <article
                  key={c.id}
                  data-selected={task.canvas?.selectedCandidateId === c.id}
                >
                  {c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" />}
                  <div>
                    <small>
                      {c.type === "place"
                        ? c.place?.address || "Place"
                        : c.type.replaceAll("_", " ")}
                    </small>
                    <h4>{c.name}</h4>
                    <p>{c.description}</p>
                    <Sources ids={c.evidenceIds} task={task} />
                    <button
                      disabled={busy || c.freshness !== "current"}
                      aria-pressed={task.canvas?.selectedCandidateId === c.id}
                      onClick={() =>
                        mutate({
                          operation: "select",
                          nodeId: node.id,
                          candidateId: c.id,
                        })
                      }
                    >
                      {task.canvas?.selectedCandidateId === c.id ? (
                        <Check />
                      ) : (
                        <MapPin />
                      )}
                      {task.canvas?.selectedCandidateId === c.id
                        ? "Selected"
                        : "Choose this"}
                    </button>
                  </div>
                </article>
              ))}
          </div>
        );
        break;
      case "spatial":
        body = (
          <Suspense fallback={<p role="status">Opening your places…</p>}>
            <SpatialCanvas
              task={task}
              node={node}
              busy={busy}
              mutate={mutate}
            />
          </Suspense>
        );
        break;
      case "activity":
        body = (
          <div className="ic-activity">
            {task.trace.slice(-12).map((t) => (
              <details key={t.id}>
                <summary>
                  {t.action}
                  <ChevronDown />
                </summary>
                <p>{t.outcome}</p>
                <small>
                  {t.requests} requests · {t.durationMs} ms
                </small>
              </details>
            ))}
            {!task.trace.length && <p>No tool activity has been recorded.</p>}
          </div>
        );
        break;
    }

    return (
      <section key={id} className={`ic-component ic-component-${node.type}`}>
        {heading}
        {body}
      </section>
    );
  }

  return (
    <div className="ic-composition" key={surface.id}>
      {render(surface.root)}
    </div>
  );
}

function CanvasTabs({
  node,
  surface,
  render,
}: {
  node: Extract<PresentationNode, { children: string[] }>;
  surface: Presentation;
  render: (id: string) => ReactNode;
}) {
  const [selected, setSelected] = useState(node.children[0]);
  const active = node.children.includes(selected) ? selected : node.children[0];

  return (
    <div className="ic-tabs">
      <div role="tablist" aria-label={node.title || "Canvas views"}>
        {node.children.map((id) => (
          <button
            key={id}
            id={`tab-${surface.id}-${id}`}
            role="tab"
            aria-selected={active === id}
            aria-controls={`panel-${surface.id}-${id}`}
            onClick={() => setSelected(id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const i = node.children.indexOf(id);
                const next =
                  node.children[
                    (i +
                      (e.key === "ArrowRight" ? 1 : node.children.length - 1)) %
                      node.children.length
                  ];
                setSelected(next);
                document.getElementById(`tab-${surface.id}-${next}`)?.focus();
              }
            }}
          >
            {surface.nodes.find((n) => n.id === id)?.title || "View"}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${surface.id}-${active}`}
        aria-labelledby={`tab-${surface.id}-${active}`}
      >
        {render(active)}
      </div>
    </div>
  );
}

function safeLink(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function Sources({
  ids,
  task,
  expanded = false,
}: {
  ids: string[];
  task: Task;
  expanded?: boolean;
}) {
  const records = ids
    .map((id) => task.evidence.find((e) => e.id === id))
    .filter((e) => !!e);

  if (!records.length) {
    return null;
  }

  return (
    <details className="ic-sources" open={expanded || undefined}>
      <summary>
        {records.length === 1 ? "View source" : `${records.length} sources`}
        <ChevronDown />
      </summary>
      {records.map((e) => (
        <article key={e.id}>
          <small>
            {e.source.replaceAll("-", " ")} · {e.freshness}
            {e.delivery && ` · ${e.delivery}`}
          </small>
          <p>{e.summary}</p>
          {safeLink(e.reference) ? (
            <a href={safeLink(e.reference)!} target="_blank" rel="noreferrer">
              Open source <ArrowUpRight />
            </a>
          ) : (
            <p className="ic-note">{e.reference}</p>
          )}
          {e.limitations.map((l, i) => (
            <p key={i} className="ic-note">
              {l}
            </p>
          ))}
        </article>
      ))}
    </details>
  );
}

function DataTable({
  node,
  filter,
  busy,
  mutate,
  task,
}: {
  node: Extract<PresentationNode, { type: "table" }>;
  filter: string;
  busy: boolean;
  mutate: (m: CanvasMutation) => void;
  task: Task;
}) {
  const [value, setValue] = useState(filter);
  const [previousFilter, setPreviousFilter] = useState(filter);

  if (filter !== previousFilter) {
    setPreviousFilter(filter);
    setValue(filter);
  }

  const rows = node.rows.filter((r) =>
    r.cells.join(" ").toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <>
      <form
        className="ic-filter"
        onSubmit={(e) => {
          e.preventDefault();
          mutate({ operation: "filter", nodeId: node.id, value });
        }}
      >
        <Search />
        <input
          aria-label={`Filter ${node.title || "table"}`}
          placeholder="Find in this table"
          value={value}
          maxLength={200}
          onChange={(e) => setValue(e.target.value)}
        />
        <button disabled={busy}>Apply</button>
      </form>
      <div
        className="ic-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={node.title || "Comparison table"}
      >
        <table>
          <thead>
            <tr>
              {node.columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {r.cells.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
                <td>
                  <Sources ids={r.evidenceIds} task={task} />
                  {!r.evidenceIds.length && <small>No retrieved source</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p>No rows match this filter.</p>}
      </div>
    </>
  );
}

function CanvasDocument({
  node,
  task,
  busy,
  mutate,
  onTurn,
}: {
  node: Extract<PresentationNode, { type: "document" }>;
  task: Task;
  busy: boolean;
  mutate: (m: CanvasMutation) => void;
  onTurn: Props["onTurn"];
}) {
  const artifact = node.artifactId
    ? task.artifacts.find((a) => a.id === node.artifactId)
    : undefined;
  const saved = artifact?.content ?? node.content ?? "";
  const [draft, setDraft] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState(saved);
  const dirty = draft !== base;

  if (saved === draft && base !== saved) {
    setBase(saved);
  } else if (!dirty && base !== saved) {
    setDraft(saved);
    setBase(saved);
  }

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const conflict = dirty && saved !== base;

  return (
    <div className="ic-document">
      <div className="ic-document-toolbar">
        <span>
          <FileText />
          {artifact?.freshness === "stale"
            ? "Updating document"
            : dirty
              ? "Unsaved changes"
              : "Saved draft"}
        </span>
        <button aria-pressed={editing} onClick={() => morphLayout(() => setEditing(!editing))}>
          {editing ? "Preview" : "Edit draft"}
        </button>
      </div>
      {editing ? (
        <div className="ic-document-split">
          <label className="ic-draft-label">
            Your draft
            <textarea
              aria-label={`Edit ${node.title || artifact?.title || "draft"}`}
              value={draft}
              maxLength={node.artifactId ? 10000 : 12000}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <div className="ic-paper">
            <ProductText text={draft} />
          </div>
        </div>
      ) : (
        <div className="ic-paper">
          <ProductText text={draft} />
        </div>
      )}
      {dirty && (
        <div className="ic-document-save">
          <button
            disabled={
              busy ||
              !draft.trim() ||
              conflict ||
              artifact?.freshness === "stale"
            }
            onClick={() => {
              if (node.artifactId) {
                onTurn({
                  type: "artifact",
                  artifactId: node.artifactId,
                  content: draft,
                });
              } else {
                mutate({ operation: "edit", nodeId: node.id, content: draft });
              }
            }}
          >
            <Save />
            Save changes
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setDraft(saved);
              setBase(saved);
            }}
          >
            Use saved version
          </button>
          <p role="status">
            {conflict
              ? "Igor updated this draft while you were editing. Keep a copy before loading the saved version."
              : "Save to share these edits with Igor."}
          </p>
        </div>
      )}
    </div>
  );
}
