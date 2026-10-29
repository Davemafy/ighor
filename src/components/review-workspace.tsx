"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  LoaderCircle,
  MessageCircle,
  Send,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Snapshot } from "@/core/outcomes";
import "../app/product.css";

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
      .then(async (r) => {
        if (!r.ok) {
          throw Error("This review link is unavailable or has expired.");
        }

        const d = await r.json();

        if (active) {
          setData(d);
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
      const r = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          type === "comment" ? { type, text } : { type, value, polarity },
        ),
      });

      if (!r.ok) {
        throw Error("Your feedback could not be saved. Please try again.");
      }

      setStatus(
        "Your feedback is with the owner. They choose whether to apply it.",
      );
      setText("");
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ip-app pp-review">
      <header className="pp-review-top">
        <Link href="/">igor</Link>
        <span>A shared draft</span>
        <a href="/app">
          Open Igor <ArrowUpRight />
        </a>
      </header>
      <main className="pp-review-layout">
        <div className="pp-review-document">
          <span className="ip-kicker">A SECOND PAIR OF EYES</span>
          <h1>{data?.snapshot.goal || "A draft to consider."}</h1>
          {!data && !error && (
            <p role="status">
              <LoaderCircle className="ig-spin" />
              Opening the shared draft
            </p>
          )}
          {data?.snapshot.artifacts.map((a) => (
            <article className="ip-paper" key={a.id}>
              <small>SHARED WITH IGOR</small>
              <h2>{a.title}</h2>
              <div>{a.content}</div>
              {a.assumptions.length > 0 && (
                <details>
                  <summary>
                    Assumptions <ChevronDown />
                  </summary>
                  {a.assumptions.map((v) => (
                    <p key={v}>{v}</p>
                  ))}
                </details>
              )}
            </article>
          ))}
          {data && (
            <details className="pp-source">
              <summary>
                Sources and limitations <ChevronDown />
              </summary>
              {data.snapshot.evidence.map((e) => (
                <article key={e.id}>
                  <p>{e.summary}</p>
                  <small>
                    {e.source.replaceAll("-", " ")} ·{" "}
                    {new Date(e.at).toLocaleDateString()}
                  </small>
                  {e.limitations.map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </article>
              ))}
            </details>
          )}
        </div>
        <aside className="pp-review-feedback">
          <MessageCircle />
          <h2>A fresh perspective.</h2>
          <p>
            This is a saved snapshot. Your feedback goes to the owner, who
            decides what changes.
          </p>
          {data && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit("comment");
                }}
              >
                <label htmlFor="review-comment">
                  What works, or needs a little thought?
                </label>
                <textarea
                  id="review-comment"
                  required
                  maxLength={1500}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Your thoughts…"
                />
                <button className="pp-solid" disabled={busy || !text.trim()}>
                  {busy ? <LoaderCircle className="ig-spin" /> : <Send />}Send
                  feedback
                </button>
              </form>
              {data.canProposePreference && (
                <details className="pp-source">
                  <summary>
                    Suggest a taste correction <ChevronDown />
                  </summary>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit("preference");
                    }}
                  >
                    <label>
                      Artist, film or interest
                      <input
                        required
                        maxLength={100}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                      />
                    </label>
                    <label htmlFor="review-preference">Preference</label>
                    <select
                        id="review-preference"
                        aria-label="Preference"
                        value={polarity}
                        onChange={(e) => setPolarity(e.target.value)}
                      >
                        <option value="like">Like</option>
                        <option value="dislike">Dislike</option>
                        <option value="unknown">Unknown</option>
                        <option value="not-now">
                          Not interested right now
                        </option>
                    </select>
                    <button
                      className="pp-solid"
                      disabled={busy || !value.trim()}
                    >
                      Propose correction
                    </button>
                  </form>
                </details>
              )}
              <small>
                Link access does not verify identity. Expires{" "}
                {new Date(data.expiresAt).toLocaleDateString()}.
              </small>
            </>
          )}
          {error && (
            <p className="ip-error" role="alert">
              {error}
            </p>
          )}
          {status && (
            <p className="pp-status" role="status">
              <Check />
              {status}
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}
