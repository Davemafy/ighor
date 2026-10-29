"use client";

import type { Task, TaskAction } from "@/core/contracts";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Search } from "./workspace-icons";
import { DiscoveryDialog } from "./discovery/dialog";

const genericHosts = new Set([
  "www.google.com",
  "google.com",
  "www.youtube.com",
  "youtube.com",
  "www.tiktok.com",
  "tiktok.com",
  "www.reddit.com",
  "reddit.com",
  "www.facebook.com",
  "facebook.com",
]);

function hostOf(reference: string) {
  try {
    return new URL(reference).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isDirectory(reference: string) {
  try {
    const url = new URL(reference);
    const hostname = url.hostname.toLowerCase();

    return (
      genericHosts.has(hostname) ||
      hostname.endsWith(".reddit.com") ||
      hostname.endsWith(".tiktok.com") ||
      hostname.endsWith(".facebook.com") ||
      (hostname.endsWith("yelp.com") && url.pathname.startsWith("/search"))
    );
  } catch {
    return true;
  }
}

/** User-visible results use only actual persisted evidence; never invent places. */
export function buildResearchCards(task: Task) {
  const report = [...task.artifacts]
    .reverse()
    .find((a) => a.kind === "research-report" && a.freshness === "current");

  if (!report) {
    return null;
  }

  const findings = report.evidenceIds
    .map((id) => task.evidence.find((e) => e.id === id))
    .filter(
      (e): e is Task["evidence"][number] => !!e && e.freshness === "current",
    )
    .map((e) => {
      const isWeb = e.kind === "practical" && e.source === "provider-returned";
      const webUrl =
        isWeb && e.reference.startsWith("https://") ? e.reference : null;
      const title = e.title || e.summary.split(": ")[0] || "Research reference";

      return {
        id: e.id,
        title,
        description: e.summary.startsWith(title + ": ")
          ? e.summary.slice((title + ": ").length)
          : e.summary,
        url: webUrl,
        imageUrl: e.previewImageUrl,
        domain: webUrl ? hostOf(webUrl) : "Qloo",
        kind: isWeb ? ("web" as const) : ("qloo" as const),
        verification:
          webUrl && !isDirectory(webUrl)
            ? "Web source"
            : isWeb
              ? "Secondary reference"
              : "Qloo match",
        direct: !!webUrl && !isDirectory(webUrl),
        limitations: e.limitations,
        at: e.at,
      };
    });
  findings.sort((a, b) => Number(b.direct) - Number(a.direct));

  return { report, findings };
}

type Finding = NonNullable<
  ReturnType<typeof buildResearchCards>
>["findings"][number];

function SourceImage({ finding }: { finding: Finding }) {
  const [failed, setFailed] = useState(false);

  return finding.imageUrl && !failed ? (
    <img
      src={finding.imageUrl}
      alt={finding.title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="ird-source-placeholder" aria-hidden="true">
      {finding.domain}
    </span>
  );
}

export function ResearchDiscovery({
  task,
  busy = false,
  onTurn,
}: {
  task: Task;
  busy?: boolean;
  onTurn?: (action: TaskAction) => Promise<void>;
}) {
  const data = buildResearchCards(task);
  const [filter, setFilter] = useState<"all" | "web" | "qloo">("all");
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!data) {
    return null;
  }

  const { findings, report } = data;
  const selected = findings.find((item) => item.id === selectedId);
  const filtered = findings.filter(
    (item) => filter === "all" || item.kind === filter,
  );
  const webCount = findings.filter((item) => item.kind === "web").length;
  const qlooCount = findings.length - webCount;

  return (
    <section className="ird-experience" aria-label="Visual research findings">
      <header className="ird-intro">
        <div className="ird-masthead">
          <span>Explore / {task.brief.goal || "Your conversation"}</span>
          <span>{String(findings.length).padStart(2, "0")} references</span>
        </div>
        <h2>{report.title}</h2>
        <p>
          Sources collected for this request. Inspect a reference to see its
          context and what still needs checking.
        </p>
      </header>
      {webCount > 0 && qlooCount > 0 && (
        <nav className="ird-filters" aria-label="Filter references">
          {(
            [
              ["all", "All", findings.length],
              ["web", "Web", webCount],
              ["qloo", "Qloo", qlooCount],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setExpanded(false);
              }}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </nav>
      )}
      {filtered.length ? (
        <div className="ird-gallery">
          {(expanded ? filtered : filtered.slice(0, 6)).map((finding, index) => (
            <article
              className={
                "ird-card" +
                (finding.imageUrl ? " ird-has-image" : " ird-link-card")
              }
              key={finding.id}
            >
              <button
                type="button"
                className="ird-card-open"
                onClick={() => setSelectedId(finding.id)}
                aria-label={`Open ${finding.title}`}
              >
                <span className="ird-cover">
                  {finding.imageUrl ? (
                    <SourceImage key={finding.imageUrl} finding={finding} />
                  ) : (
                    <span className="ird-reference-number" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  )}
                </span>
                <span className="ird-card-body">
                  <span className="ird-card-index">
                    <span>{finding.domain}</span>
                    <span className="ird-source-tag">{finding.verification}</span>
                  </span>
                  <h3>{finding.title}</h3>
                  {finding.description && (
                    <span className="ird-description">
                      {finding.description}
                    </span>
                  )}
                  <span className="ird-card-action">
                    Inspect reference <ArrowUpRight />
                  </span>
                </span>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="ird-empty">
          <Search />
          <h3>No references yet</h3>
          <p>
            Try a more specific place or direction. Your existing work is still
            saved.
          </p>
        </div>
      )}
      {filtered.length > 6 && (
        <button
          className="ird-show-more"
          type="button"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `See all ${filtered.length} references`}
          <ArrowRight />
        </button>
      )}
      <details className="ird-quality">
        <summary>
          About these sources <span>What’s verified?</span>
        </summary>
        <p>
          Web pages and Qloo matches inform this collection. A source link is
          not confirmation of a venue, price, availability or booking. Each
          reference keeps its own evidence and limitations.
        </p>
      </details>
      <DiscoveryDialog
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title="A closer look"
      >
        {selected && (
          <article
            className={
              "ird-detail" + (selected.imageUrl ? " ird-detail-with-image" : "")
            }
          >
            <div className="ird-detail-cover">
              <SourceImage key={selected.id} finding={selected} />
            </div>
            <div className="ird-detail-copy">
              <span className="ird-detail-domain">
                {selected.domain} · {selected.verification}
              </span>
              <h3>{selected.title}</h3>
              {selected.description && <p>{selected.description}</p>}
              <div className="ird-detail-actions">
                {selected.url && (
                  <a
                    className="ird-primary"
                    href={selected.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open source <ArrowUpRight />
                  </a>
                )}
                {onTurn && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const text = `Build on this saved reference for my current request: ${selected.title} (evidence ${selected.id}). Use its actual evidence and preserve its limitations; do not assume availability or a booking.`;
                      setSelectedId(null);
                      void onTurn({ type: "message", text });
                    }}
                  >
                    Build on this <ArrowRight />
                  </button>
                )}
              </div>
              <details className="ird-source-notes">
                <summary>Source details</summary>
                <p>
                  {selected.kind === "qloo"
                    ? "Cultural match from Qloo; practical details need checking."
                    : "Retrieved web reference; relevance is Igor’s interpretation."}
                </p>
                {selected.limitations.map((note) => (
                  <p key={note}>{note}</p>
                ))}
                <p>
                  Retrieved{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }).format(new Date(selected.at))}
                </p>
              </details>
            </div>
          </article>
        )}
      </DiscoveryDialog>
    </section>
  );
}
