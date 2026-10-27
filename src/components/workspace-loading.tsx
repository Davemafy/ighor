"use client";

import { useEffect, useRef, useState } from "react";
import type { TurnFeedback } from "./turn-feedback";
import { ChevronDown } from "./workspace-icons";

export function LoadingSurface({ mode }: { mode: "workspace" | "list" }) {
  return (
    <section
      className={`iw-loading-surface iw-loading-${mode}`}
      role="status"
      aria-label={
        mode === "workspace" ? "Loading your workspace" : "Loading saved work"
      }
    >
      <span className="iw-sr">
        {mode === "workspace" ? "Loading your workspace" : "Loading saved work"}
      </span>
      <div aria-hidden="true">
        {mode === "workspace" && (
          <div className="iw-loading-heading">
            <i className="iw-skeleton" />
            <i className="iw-skeleton" />
          </div>
        )}
        <div className="iw-loading-rows">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <i className="iw-skeleton iw-skeleton-square" />
              <span>
                <i className="iw-skeleton" />
                <i className="iw-skeleton" />
              </span>
            </div>
          ))}
        </div>
        {mode === "workspace" && (
          <div className="iw-loading-compose iw-skeleton" />
        )}
      </div>
    </section>
  );
}

export function LoadingImage({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    setReady(Boolean(ref.current?.complete && ref.current?.naturalWidth));
  }, [src]);
  return (
    <span className="iw-loading-image" data-ready={ready || failed}>
      {!ready && !failed && <span className="iw-skeleton" aria-hidden="true" />}
      <img
        ref={ref}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setReady(true)}
        onError={() => setFailed(true)}
        style={{ opacity: ready ? 1 : 0 }}
      />
    </span>
  );
}

export function AgentActivity({
  busy,
  feedback,
  message,
  waitingForReply,
}: {
  busy: boolean;
  feedback: TurnFeedback | null;
  message: string;
  waitingForReply: boolean;
}) {
  if (!busy || !feedback) return null;
  const activity = feedback.activity;
  const status = activity?.actionStatus;
  const title =
    status === "awaiting-approval"
      ? "Waiting for your review"
      : status === "blocked"
        ? "A step needs attention"
        : status === "failed"
          ? "A step could not finish"
          : activity?.kind === "tool-invocation" ||
              activity?.kind === "tool-result"
            ? "Working on your request"
            : feedback.action.type === "message"
              ? "Thinking"
              : "Saving your changes";
  const events = (feedback.activities ?? [])
    .filter(
      (item) =>
        !["message-added", "task-started", "state-changed"].includes(
          item.activity.kind,
        ),
    )
    .slice(-6);
  const quiet =
    /^(Processing this turn|User message saved|Assistant message saved|Completed the turn)/i.test(
      message,
    );
  return (
    <div className="iw-agent-working">
      <div
        className="iw-agent-working-heading"
        role="status"
        aria-live="polite"
      >
        <span className="iw-thinking-mark">
          <img
            src="/marketing/assets/brand/igor-mark-black.svg"
            alt=""
            width="22"
            height="22"
          />
        </span>
        <span>{title}</span>
        <span className="iw-thinking-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      {message && !quiet && <p className="iw-working-detail">{message}</p>}
      {events.length > 0 && (
        <details className="iw-live-activity">
          <summary>
            Activity
            <ChevronDown />
          </summary>
          <ol>
            {events.map((item) => (
              <li key={item.activity.eventId}>
                <span
                  className="iw-event-state"
                  data-state={item.activity.actionStatus}
                  aria-label={item.activity.actionStatus}
                />
                <span>{item.message}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {waitingForReply && (
        <div className="iw-response-skeleton" aria-hidden="true">
          <i className="iw-skeleton" />
          <i className="iw-skeleton" />
          <i className="iw-skeleton" />
        </div>
      )}
    </div>
  );
}
