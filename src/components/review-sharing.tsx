"use client";
import { useState } from "react";
import type { Task } from "@/core/contracts";
import type { StoredShare, StoredReview } from "@/data/outcome-store";
import type { SaveOutput } from "./use-saved-outcomes";

export function ReviewSharing({
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
  const [participant, setParticipant] = useState("");
  const [consent, setConsent] = useState(false);
  const [link, setLink] = useState("");
  const main = task.artifacts.find((artifact) => artifact.id === "main");

  return (
    <section>
      <h3>Invite a review</h3>
      <p>
        Only the current working document and its cited evidence are included.
        The link is a frozen snapshot, expires after seven days and can be
        revoked. Anyone with it has access; identity is not verified.
      </p>
      <p>Goal included: {task.brief.goal}</p>
      <label htmlFor="share-preview">Exact document text to share</label>
      <textarea
        id="share-preview"
        readOnly
        value={main?.content ?? "Create an outcome first."}
      />
      <details>
        <summary>Cited evidence included in this snapshot</summary>
        {task.evidence
          .filter((evidence) => main?.evidenceIds.includes(evidence.id))
          .map((evidence) => (
            <div key={evidence.id}>
              <strong>{evidence.summary}</strong>
              <p>
                {evidence.reference} · {evidence.at} · {evidence.source} ·{" "}
                {evidence.delivery ?? "supplied"}
              </p>
              <ul>
                {evidence.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
      </details>
      <label htmlFor="review-person">Review permission</label>
      <select
        id="review-person"
        value={participant}
        onChange={(e) => setParticipant(e.target.value)}
      >
        <option value="">Comments only</option>
        {task.brief.participants.map((participant) => (
          <option key={participant.id} value={participant.id}>
            May propose {participant.name}&apos;s taste corrections
          </option>
        ))}
      </select>
      <label className="reference-choice">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I reviewed this text and its cited evidence and want to create a private
        review link.
      </label>
      <button
        disabled={isBusy || !consent || main?.freshness !== "current"}
        onClick={async () => {
          const share = await saveOutput({
            type: "share",
            artifactIds: ["main"],
            participantId: participant || null,
            expiresInDays: 7,
          });

          if (share) {
            setLink(share.path);
            setConsent(false);
          }
        }}
      >
        Create review link
      </button>
      {link && (
        <p>
          <a href={link} target="_blank" rel="noreferrer">
            Open private review
          </a>
          <input
            aria-label="Private review URL"
            readOnly
            value={
              typeof window !== "undefined"
                ? window.location.origin + link
                : link
            }
          />
        </p>
      )}
      {shares.map((share) => (
        <div className="saved-share" key={share.id}>
          <span>
            Snapshot v{share.snapshot.sourceVersion} ·{" "}
            {share.revoked
              ? "revoked"
              : `expires ${new Date(share.expiresAt).toLocaleDateString()}`}
          </span>
          <button
            disabled={isBusy || share.revoked}
            onClick={() => void saveOutput({ type: "revoke", id: share.id })}
          >
            Revoke
          </button>
        </div>
      ))}
      <h4>Review inbox</h4>
      <button disabled={isBusy} onClick={() => void onRefresh()}>
        Refresh reviews &amp; collections
      </button>
      {!reviews.length && (
        <p>No feedback received. This is not evidence of user validation.</p>
      )}
      {reviews.map((review) => (
        <article className="review-inbox-row" key={review.id}>
          <p>
            {review.proposal.type === "comment"
              ? review.proposal.text
              : `${review.proposal.value} · ${review.proposal.polarity} (proposed for ${task.brief.participants.find((participant) => participant.id === review.participantId)?.name ?? "a participant"})`}
          </p>
          <p className="micro">
            Link-holder feedback · identity unverified ·{" "}
            {new Date(review.at).toLocaleString()}
          </p>
          <button
            disabled={isBusy || review.accepted}
            onClick={() =>
              void saveOutput({ type: "accept-review", id: review.id })
            }
          >
            {review.accepted
              ? "Reviewed"
              : review.proposal.type === "comment"
                ? "Acknowledge"
                : "Accept this participant's correction"}
          </button>
        </article>
      ))}
    </section>
  );
}
