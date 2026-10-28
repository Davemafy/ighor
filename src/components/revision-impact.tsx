"use client";

import type { Task } from "../core/contracts";
import { readRevisionImpact } from "./revision-impact-model";

type SavedDocument = NonNullable<Task["work"]>["documents"][number];

/** Snapshot diff and approval ledger, displayed only from persisted Task data. */
export function RevisionImpact({
  task,
  document,
}: {
  task: Task;
  document: SavedDocument;
}) {
  const impact = readRevisionImpact(task, document);
  const sourceCount =
    impact.cultural.live +
    impact.cultural.cached +
    impact.cultural.unclassified;

  return (
    <section className="ig-revision-impact" aria-label="Saved revision impact">
      <header>
        <p>YOUR WORK / WHAT CHANGED</p>
        <h3>Version {impact.version}, with the context intact.</h3>
        <span>Read from the saved document, approvals and evidence ledger.</span>
      </header>
      <div className="ig-revision-impact-grid">
        <article>
          <h4>Changed</h4>
          {impact.changed && impact.difference ? (
            <>
              <p>
                Saved text differs from version {impact.previousVersion}.
              </p>
              <small>PREVIOUS EXCERPT</small>
              <blockquote>{impact.difference.before}</blockquote>
              <small>NOW SAVED</small>
              <blockquote>{impact.difference.after}</blockquote>
            </>
          ) : (
            <p>
              {impact.previousVersion === null
                ? "No earlier saved document version to compare."
                : "No text change detected against the previous saved version."}
            </p>
          )}
        </article>
        <article>
          <h4>Still confirmed</h4>
          {impact.confirmedBudget !== null ? (
            <p className="ig-revision-impact-money">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              }).format(impact.confirmedBudget)}
              <small>Confirmed budget in saved work</small>
            </p>
          ) : (
            <p>No confirmed budget is stored.</p>
          )}
          {impact.approvedElsewhere.length ? (
            <>
              <small>OTHER WORK STILL APPROVED</small>
              <ul>
                {impact.approvedElsewhere.slice(0, 4).map((title, index) => (
                  <li key={index}>{title}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>No independently approved work is recorded.</p>
          )}
        </article>
        <article>
          <h4>Unresolved</h4>
          {impact.unresolved.length ? (
            <ul>
              {impact.unresolved.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>
              No blocker appears in the latest saved checks. Real-world
              feasibility and licensing are not established by cultural affinity.
            </p>
          )}
        </article>
      </div>
      <footer>
        {sourceCount ? (
          <span>
            Cultural evidence in current task: {impact.cultural.live} LIVE ·{" "}
            {impact.cultural.cached} CACHED ·{" "}
            {impact.cultural.unclassified} unspecified delivery.
            Inspect individual sources before using their claims.
          </span>
        ) : (
          <span>No current cultural evidence is stored in this task.</span>
        )}
      </footer>
    </section>
  );
}
