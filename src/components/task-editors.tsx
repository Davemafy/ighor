"use client";

import { useState } from "react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import type { Participant, Task, TaskAction } from "@/core/contracts";

export function ConstraintEditor({
  task,
  busy,
  onSave,
}: {
  task: Task;
  busy: boolean;
  onSave: (a: TaskAction) => void;
}) {
  const [budget, setBudget] = useState(task.brief.constraints.budget);
  const [duration, setDuration] = useState(task.brief.constraints.duration);
  const [location, setLocation] = useState(task.brief.constraints.location);
  const constraints = task.brief.constraints;
  const key = `${constraints.budget}:${constraints.duration}:${constraints.location}`;

  return (
    <form
      key={key}
      className="constraint-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ type: "constraints", budget, duration, location });
      }}
    >
      <div className="constraint-pair">
        <label>
          Group budget{" "}
          <div className="unit-input">
            <span>$</span>
            <input
              aria-label="Group budget"
              type="number"
              min="0"
              max="1000000"
              defaultValue={constraints.budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </div>
        </label>
        <label>
          Time together{" "}
          <div className="unit-input">
            <input
              aria-label="Time limit in minutes"
              type="number"
              min="15"
              max="1440"
              defaultValue={constraints.duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
            <span>min</span>
          </div>
        </label>
      </div>
      <label>
        Where{" "}
        <input
          aria-label="Location"
          defaultValue={constraints.location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>
      <button className="secondary-button" type="submit" disabled={busy}>
        Update brief <ArrowRight size={14} />
      </button>
      <p className="micro muted">USD · illustrative planning values</p>
    </form>
  );
}

export function ParticipantEditor({
  participant: p,
  index,
  busy,
  onSave,
}: {
  participant: Participant;
  index: number;
  busy: boolean;
  onSave: (a: TaskAction) => void;
}) {
  const [name, setName] = useState(p.name);
  const [likes, setLikes] = useState(
    p.preferences
      .filter((x) => x.polarity === "like")
      .map((x) => (x.entityType ? `${x.entityType}:${x.value}` : x.value))
      .join("; "),
  );
  const [dislikes, setDislikes] = useState(
    p.preferences
      .filter((x) => x.polarity === "dislike")
      .map((x) => (x.entityType ? `${x.entityType}:${x.value}` : x.value))
      .join(", "),
  );

  return (
    <details className="participant">
      <summary>
        <span className={`avatar tone-${index % 6}`}>{p.name.slice(0, 1)}</span>
        <span className="person-text">
          <strong>{p.name}</strong>
          <small>
            {p.preferences
              .filter((x) => x.polarity === "like")
              .slice(0, 2)
              .map((x) => x.value)
              .join(" · ") || "No confirmed likes yet"}
          </small>
        </span>
        <ChevronDown size={13} />
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const preferences = [
            ...likes.split(likes.includes(";") ? ";" : ",").map((value) => ({
              value: value.trim(),
              polarity: "like" as const,
            })),
            ...dislikes
              .split(dislikes.includes(";") ? ";" : ",")
              .map((value) => ({
                value: value.trim(),
                polarity: "dislike" as const,
              })),
          ]
            .filter((x) => x.value)
            .map((x, i) => ({
              ...x,
              ...(/^(artist|movie|tv_show):/.test(x.value)
                ? {
                    entityType: x.value.split(":")[0] as
                      "artist" | "movie" | "tv_show",
                    value: x.value.slice(x.value.indexOf(":") + 1).trim(),
                  }
                : {}),
              id: `${p.id}:edited:${i}`,
              subject: p.id,
              source: "user-supplied" as const,
              confirmed: true,
              scope: "participant" as const,
            }));
          onSave({
            type: "participant",
            participant: { ...p, name, preferences, sample: false },
          });
        }}
      >
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />
        </label>
        <label>
          Confirmed likes
          <input
            aria-label={`${p.name} likes`}
            value={likes}
            onChange={(e) => setLikes(e.target.value)}
          />
        </label>
        <label>
          Dislikes
          <input
            aria-label={`${p.name} dislikes`}
            value={dislikes}
            onChange={(e) => setDislikes(e.target.value)}
          />
        </label>
        <p className="micro muted">
          Separate seeds with semicolons (commas also work for simple names).
          Use artist:Radiohead, movie:Arrival or tv_show:Severance for typed
          seeds. Blank means unknown, not dislike.
        </p>
        <button className="secondary-button" disabled={busy}>
          Save {p.name}’s preferences
        </button>
      </form>
    </details>
  );
}

export function PracticalEditor({
  candidate: c,
  task,
  busy,
  save,
}: {
  candidate: Task["candidates"][number];
  task: Task;
  busy: boolean;
  save: (a: TaskAction) => void;
}) {
  const [cost, setCost] = useState(c.cost.value?.toString() ?? "");
  const [minutes, setMinutes] = useState(c.duration.value?.toString() ?? "");
  const [access, setAccess] = useState(
    c.available === null ? "unknown" : c.available ? "yes" : "no",
  );

  return (
    <form
      className="constraint-form"
      onSubmit={(e) => {
        e.preventDefault();
        const at = new Date().toISOString();
        save({
          type: "catalogue",
          options: task.catalogue.map((x) =>
            x.id !== c.id
              ? x
              : {
                  ...x,
                  cost: {
                    value: cost === "" ? null : Number(cost),
                    source: "user-supplied",
                    reference: "User supplied group cost",
                    at,
                  },
                  duration: {
                    value: minutes === "" ? null : Number(minutes),
                    source: "user-supplied",
                    reference: "User supplied viewing/listening minutes",
                    at,
                  },
                  available: access === "unknown" ? null : access === "yes",
                  availabilitySource: "user-supplied",
                  location: task.brief.constraints.location,
                },
          ),
        });
      }}
    >
      <label>
        Group cost for {c.name}
        <input
          aria-label={`Cost for ${c.name}`}
          type="number"
          min="0"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </label>
      <label>
        Minutes for {c.name}
        <input
          aria-label={`Minutes for ${c.name}`}
          type="number"
          min="0"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </label>
      <label>
        Access for {c.name}
        <select
          aria-label={`Access for ${c.name}`}
          value={access}
          onChange={(e) => setAccess(e.target.value)}
        >
          <option value="unknown">Unknown</option>
          <option value="yes">I confirm access</option>
          <option value="no">Unavailable</option>
        </select>
      </label>
      <button className="secondary-button" disabled={busy}>
        Save practical facts
      </button>
    </form>
  );
}

export function ArtifactEditor({
  artifact,
  disabled,
  save,
}: {
  artifact: NonNullable<Task["artifacts"][number]>;
  disabled: boolean;
  save: (a: TaskAction) => void;
}) {
  const [content, setContent] = useState(artifact.content);

  return (
    <form
      key={`${artifact.id}-${artifact.version}`}
      className="artifact-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save({ type: "artifact", artifactId: artifact.id, content });
      }}
    >
      <textarea
        aria-label={`Edit ${artifact.kind}`}
        defaultValue={artifact.content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={10000}
      />
      <div className="editor-footer">
        <span>
          Version {artifact.version} ·{" "}
          {artifact.edited
            ? "User-edited text"
            : "Generated from the current selection"}
        </span>
        <button className="secondary-button" disabled={disabled}>
          Save draft <Check size={14} />
        </button>
      </div>
    </form>
  );
}

export function PersonalStart({
  busy,
  send,
}: {
  busy: boolean;
  send: (action: TaskAction) => Promise<void>;
}) {
  const [name, setName] = useState("You");
  const [artist, setArtist] = useState("");
  const [film, setFilm] = useState("");

  return (
    <details className="personal-start">
      <summary>Start from your own taste</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send({
            type: "personal-profile",
            name,
            artist,
            ...(film.trim() ? { film } : {}),
          });
        }}
      >
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />
        </label>
        <label>
          An artist you love
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label>
          A film you love (optional)
          <input
            value={film}
            onChange={(e) => setFilm(e.target.value)}
            maxLength={100}
          />
        </label>
        <p>
          Your tastes stay in this task unless you explicitly save them to
          memory.
        </p>
        <button
          className="primary-button"
          disabled={busy || !artist.trim() || !name.trim()}
        >
          Explore from my taste
        </button>
      </form>
    </details>
  );
}
