"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Copy } from "lucide-react";
import type { Task, TaskAction } from "@/core/contracts";
import {
  composeInvitationDraft,
  projectInvitationScene,
  type InvitationScene,
} from "@/core/invitation-scene";
import "../app/invitation-studio.css";

const styles = [
  { id: "lilac", name: "Lilac" },
  { id: "tangerine", name: "Tangerine" },
  { id: "ink", name: "Midnight" },
] as const;
type Style = (typeof styles)[number]["id"];

/** A useful invitation, not a simulated event or an RSVP interface. */
export function InvitationStudio({
  task,
  busy,
  onTurn,
}: {
  task: Task;
  busy: boolean;
  onTurn: (action: TaskAction) => Promise<void>;
}) {
  const scene = projectInvitationScene(task);

  if (!scene) {
    return null;
  }

  return (
    <InvitationEditor
      key={`${task.id}:${scene.artifact?.version ?? "new"}`}
      scene={scene}
      busy={busy}
      onTurn={onTurn}
    />
  );
}

function InvitationEditor({
  scene,
  busy,
  onTurn,
}: {
  scene: InvitationScene;
  busy: boolean;
  onTurn: (action: TaskAction) => Promise<void>;
}) {
  const [style, setStyle] = useState<Style>("lilac");
  const [title, setTitle] = useState(scene.title);
  const [body, setBody] = useState(scene.body);
  const [notice, setNotice] = useState("");
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  const [imageReady, setImageReady] = useState<string[]>([]);

  const writable =
    scene.state === "current" && !!scene.artifact && !scene.artifact.locked;
  const dirty = title !== scene.title || body !== scene.body;
  const visibleReferences = scene.references.filter(
    (item) => !!item.imageUrl && !imageErrors.includes(item.id),
  );
  const hasSampleProfiles = scene.sampleProfiles;

  useEffect(() => {
    try {
      const stored = localStorage.getItem("igor-invite-style");

      if (styles.some((option) => option.id === stored)) {
        setStyle(stored as Style);
      }
    } catch {
      // Custom preview style works without client-side persistence.
    }
  }, []);

  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function chooseStyle(next: Style) {
    setStyle(next);
    try {
      localStorage.setItem("igor-invite-style", next);
    } catch {
      // The preview itself remains usable without storage.
    }
  }

  async function copyDraft() {
    if (!scene.artifact) return;

    try {
      await navigator.clipboard.writeText(
        `${title.trim()}\n\n${body.trim()}`,
      );
      setNotice("Copied the invitation text. Nothing was sent.");
    } catch {
      setNotice("Could not copy automatically. Select the message to copy it.");
    }
  }

  async function saveDraft() {
    if (!writable || !scene.artifact) return;

    try {
      const content = composeInvitationDraft(title, body);
      setNotice("Saving changes to this conversation…");
      await onTurn({
        type: "artifact",
        artifactId: scene.artifact.id,
        content,
      });
      setNotice("Save requested. Check the updated draft before sharing.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not save this draft.",
      );
    }
  }

  return (
    <section className="ei-studio" aria-label="Your gathering invitation">
      <header className="ei-heading">
        <div>
          <span className="ei-kicker">YOUR GATHERING</span>
          <h2>Your invitation.</h2>
          <p>
            A draft you can edit and copy. Nothing is sent from here.
          </p>
        </div>
        <span className="ei-draft-state">
          {scene.state === "current"
            ? "Working draft"
            : scene.state === "needs-review"
              ? "Needs review"
              : "Not written yet"}
        </span>
      </header>

      <div className="ei-layout">
        <div className="ei-preview-area">
          <div className="ei-poster" data-style={style} aria-label="Invitation poster preview">
            <div className="ei-poster-top">
              <span>{scene.state === "not-written" ? "INVITATION PREVIEW" : "YOU’RE INVITED"}</span>
              <span className="ei-poster-sigil" aria-hidden="true">✳</span>
            </div>

            <div className="ei-poster-main">
              <div
                className={`ei-poster-title${title.length > 29 ? " ei-poster-title-long" : ""}`}
                aria-live="polite"
              >
                <h3>{title.trim() || "Untitled gathering"}</h3>
              </div>
              <div className={visibleReferences.length ? "ei-visuals" : "ei-visuals ei-visuals-type"} aria-hidden="true">
                {visibleReferences.length ? (
                  visibleReferences.slice(0, 3).map((item, index) => (
                    <div
                      className="ei-print"
                      key={item.id}
                      data-index={index}
                      data-ready={imageReady.includes(item.id)}
                    >
                      <span className="ei-print-fallback">
                        <small>{item.type.replaceAll("_", " ")}</small>
                        <strong>{item.name}</strong>
                      </span>
                      <img
                        src={item.imageUrl!}
                        alt=""
                        onLoad={() =>
                          setImageReady((ids) =>
                            ids.includes(item.id) ? ids : [...ids, item.id],
                          )
                        }
                        onError={() =>
                          setImageErrors((ids) =>
                            ids.includes(item.id) ? ids : [...ids, item.id],
                          )
                        }
                      />
                    </div>
                  ))
                ) : (
                  <>
                    <span className="ei-type-one">+</span>
                    <span className="ei-type-two">+</span>
                    <span className="ei-type-three">+</span>
                  </>
                )}
              </div>
            </div>

            <div className="ei-poster-footer">
              <div>
                <strong>DATE TO BE DECIDED</strong>
                <span>
                  {scene.locationSetting
                    ? `Location setting: ${scene.locationSetting} · not verified`
                    : "Location to be confirmed"}
                </span>
              </div>
              <span className="ei-byline">with igor<span>·</span></span>
            </div>
          </div>
          {visibleReferences.length > 0 && (
            <p className="ei-poster-caption">
              Cover art shows cultural references, not the actual gathering or venue.
              Check usage rights before publishing.
            </p>
          )}
          <p className="ei-preview-note">
            This is a preview, not a sent invitation or a confirmed booking.
          </p>
        </div>

        <div className="ei-editor">
          <div className="ei-editor-section">
            <div className="ei-editor-heading">
              <h3>Your words</h3>
              {dirty && <span>Unsaved changes</span>}
            </div>
            <label htmlFor="ei-title">Invitation title</label>
            <input
              id="ei-title"
              value={title}
              maxLength={100}
              disabled={!writable || busy}
              onChange={(event) => {
                setTitle(event.target.value);
                setNotice("");
              }}
              placeholder="Give this gathering a name"
            />
            <label htmlFor="ei-message">Message to your people</label>
            <textarea
              id="ei-message"
              value={body}
              rows={7}
              maxLength={9600}
              disabled={!writable || busy}
              onChange={(event) => {
                setBody(event.target.value);
                setNotice("");
              }}
              placeholder="What should people know?"
            />
            {scene.state === "not-written" && (
              <div className="ei-request">
                <p>
                  Your gathering is still taking shape. Ask Igor to write
                  an editable invitation from the details you’ve confirmed.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onTurn({
                      type: "message",
                      text: "Draft an editable invitation for this gathering using only the details I have confirmed. Keep any unknown date, place and logistics clearly unconfirmed.",
                    })
                  }
                >
                  Ask Igor to draft it <ArrowRight size={16} />
                </button>
              </div>
            )}
            {scene.state === "needs-review" && (
              <p className="ei-edit-warning">
                The underlying plan changed. Ask Igor to refresh this
                invitation before editing or sending it.
              </p>
            )}
            {scene.artifact?.locked && (
              <p className="ei-edit-warning">
                This invitation is approved and locked. Unlock it in Drafts to edit.
              </p>
            )}
            {scene.artifact && (
              <div className="ei-actions">
                <button
                  className="ei-save"
                  type="button"
                  disabled={!writable || busy || !dirty || !title.trim() || !body.trim()}
                  onClick={() => void saveDraft()}
                >
                  <Check size={17} /> Save changes
                </button>
                <button
                  className="ei-copy"
                  type="button"
                  disabled={busy || !body.trim()}
                  onClick={() => void copyDraft()}
                >
                  <Copy size={16} /> Copy text
                </button>
              </div>
            )}
            <p className="ei-notice" role="status" aria-live="polite">
              {notice ||
                (scene.artifact
                  ? "The text is part of your saved work. Nothing is sent automatically."
                  : "No invitation draft has been created yet.")}
            </p>
          </div>

          <div className="ei-editor-section ei-appearance">
            <h3>The look</h3>
            <p>Change the poster’s mood. The preview style stays on this device.</p>
            <div className="ei-style-grid" role="group" aria-label="Invitation appearance">
              {styles.map((option) => (
                <button
                  key={option.id}
                  aria-pressed={style === option.id}
                  onClick={() => chooseStyle(option.id)}
                >
                  <span className="ei-swatch" data-style={option.id}>
                    <span aria-hidden="true">Aa</span>
                  </span>
                  <span>{option.name}</span>
                  {style === option.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>

          <details className="ei-context">
            <summary>
              <span>What the invitation is based on</span>
              <ChevronDown size={17} />
            </summary>
            <div className="ei-context-body">
              <dl>
                <div>
                  <dt>PEOPLE</dt>
                  <dd>
                    {scene.participantCount
                      ? `${scene.participantCount} ${hasSampleProfiles ? "sample profiles — not actual invitees" : "participants in this workspace — no RSVPs"}`
                      : "No participants specified"}
                  </dd>
                </div>
                <div>
                  <dt>TIME ALLOWANCE</dt>
                  <dd>{scene.durationSetting} minutes · planning setting, not a scheduled time</dd>
                </div>
                <div>
                  <dt>BUDGET SETTING</dt>
                  <dd>${scene.budgetSetting} USD · costs are not independently verified</dd>
                </div>
              </dl>
              {scene.references.length ? (
                <div className="ei-context-references">
                  <h4>References in the current plan</h4>
                  {scene.references.map((item) => (
                    <div key={item.id}>
                      <span>{item.name}</span>
                      <small>
                        {item.evidence === "LIVE" || item.evidence === "CACHED"
                          ? `Qloo ${item.evidence.toLowerCase()} association`
                          : item.evidence === "ILLUSTRATIVE"
                            ? "Illustrative example"
                            : "Source not confirmed"}
                      </small>
                    </div>
                  ))}
                  <p>
                    A cultural connection does not establish that any
                    experience is available, affordable or booked.
                  </p>
                </div>
              ) : (
                <p>No experiences have been selected for this plan yet.</p>
              )}
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
