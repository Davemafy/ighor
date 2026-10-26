"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Snapshot } from "@/core/outcomes";

export function ReviewWorkspace({ token }: { token: string }) {
  const [data, setData] = useState<{
    snapshot: Snapshot;
    canProposePreference: boolean;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [text, setText] = useState("");
  const [value, setValue] = useState("");
  const [polarity, setPolarity] = useState("like");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/review/${token}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("This review link is unavailable or expired.");
        }

        const result = await response.json();

        if (active) {
          setData(result);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function submit(type: "comment" | "preference") {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          type === "comment" ? { type, text } : { type, value, polarity },
        ),
      });

      if (!response.ok) {
        throw new Error("Could not submit. Check this link's permissions.");
      }

      setStatus(
        "Saved for the workspace owner's review. The source plan has not changed.",
      );
      setText("");
      setValue("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="review-page">
      <Link href="/" className="wordmark">
        igor<span>·</span>
      </Link>
      <p className="eyebrow">A direction to consider</p>
      <h1>{data?.snapshot.goal ?? "Shared review"}</h1>
      <p className="helper">
        This is a frozen snapshot. You can give feedback; only the owner can
        apply a change. Access uses a private link and does not verify your
        identity.
      </p>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {data?.snapshot.artifacts.map((a) => (
        <section key={a.id}>
          <p className="artifact-type">
            {a.kind} · {a.freshness} · source v{data.snapshot.sourceVersion}
          </p>
          <h2>{a.title}</h2>
          <div className="review-prose">{a.content}</div>
          <details>
            <summary>Assumptions</summary>
            <ul>
              {a.assumptions.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </details>
        </section>
      ))}
      {data && (
        <>
          <section>
            <h2>Your perspective</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit("comment");
              }}
            >
              <label htmlFor="review-comment">
                What works, or needs changing?
              </label>
              <textarea
                id="review-comment"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={1500}
                required
              />
              <button disabled={busy || !text.trim()}>Send review</button>
            </form>
            {data.canProposePreference && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit("preference");
                }}
              >
                <h3>Suggest a taste correction</h3>
                <p>
                  This proposal belongs only to the participant assigned to your
                  link.
                </p>
                <label htmlFor="review-value">Artist, film or interest</label>
                <input
                  id="review-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  maxLength={100}
                  required
                />
                <label htmlFor="review-polarity">Preference</label>
                <select
                  id="review-polarity"
                  value={polarity}
                  onChange={(e) => setPolarity(e.target.value)}
                >
                  <option value="like">Like</option>
                  <option value="dislike">Dislike</option>
                  <option value="unknown">Unknown</option>
                  <option value="not-now">Not interested right now</option>
                </select>
                <button disabled={busy || !value.trim()}>
                  Propose correction
                </button>
              </form>
            )}
          </section>
          <details>
            <summary>Sources & limitations</summary>
            {data.snapshot.evidence.map((e) => (
              <div key={e.id}>
                <h3>{e.summary}</h3>
                <p>
                  {e.source} · {e.delivery ?? "supplied"} · {e.at}
                </p>
                <p>{e.reference}</p>
                <ul>
                  {e.limitations.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
          <p className="micro">
            Expires {new Date(data.expiresAt).toLocaleDateString()}. No messages
            are sent and nothing is booked.
          </p>
        </>
      )}
    </main>
  );
}
