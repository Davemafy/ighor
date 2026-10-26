"use client";
import { useState } from "react";
import type { Task } from "@/core/contracts";
import { ReferenceBoard } from "./reference-board";
import type { SavedCollection, SaveOutput } from "./use-saved-outcomes";

export function SavedCollections({
  task,
  collections,
  isBusy,
  saveOutput,
  onLoad,
}: {
  task: Task;
  collections: SavedCollection[];
  isBusy: boolean;
  saveOutput: SaveOutput;
  onLoad: (id: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);

  return (
    <section>
      <h3>Make a reference collection</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();

          if (
            await saveOutput({
              type: "collection",
              title,
              candidateIds: chosen,
            })
          ) {
            setTitle("");
            setChosen([]);
          }
        }}
      >
        <label htmlFor="collection-title">Collection name</label>
        <input
          id="collection-title"
          value={title}
          maxLength={100}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
        <fieldset>
          <legend>References to save</legend>
          <p className="micro">
            Saving a reference does not make it eligible or verify its facts.
          </p>
          {task.candidates
            .filter((candidate) => candidate.freshness === "current")
            .map((candidate) => (
              <label className="reference-choice" key={candidate.id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(candidate.id)}
                  onChange={(e) =>
                    setChosen(
                      e.target.checked
                        ? [...chosen, candidate.id]
                        : chosen.filter((id) => id !== candidate.id),
                    )
                  }
                />
                {candidate.name}
                <span>{candidate.eligibility}</span>
              </label>
            ))}
        </fieldset>
        <button disabled={isBusy || !title.trim() || !chosen.length}>
          Save collection
        </button>
      </form>
      <ol className="saved-collections">
        {collections.map((collection) => (
          <li key={collection.id}>
            <h4>{collection.title}</h4>
            <p className="micro">
              Frozen source v{collection.sourceVersion} ·{" "}
              {collection.sourceChanged
                ? "source has changed; recheck before use"
                : "references still match the source"}
            </p>
            <ReferenceBoard items={collection.items} />
            {collection.notes && (
              <p>
                <strong>Your interpretation:</strong> {collection.notes}
              </p>
            )}
            <CollectionEditor
              key={`${collection.id}:${collection.revision}`}
              collection={collection}
              isBusy={isBusy}
              save={saveOutput}
            />
            <button onClick={() => void onLoad(collection.taskId)}>
              Open conversation
            </button>
            <button
              disabled={isBusy}
              onClick={() =>
                void saveOutput({
                  type: "delete-collection",
                  id: collection.id,
                })
              }
            >
              Delete collection
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CollectionEditor({
  collection,
  isBusy,
  save,
}: {
  collection: SavedCollection;
  isBusy: boolean;
  save: SaveOutput;
}) {
  const [title, setTitle] = useState(collection.title);
  const [notes, setNotes] = useState(collection.notes ?? "");
  const [order, setOrder] = useState(
    collection.items.map((candidate) => candidate.id),
  );

  function move(index: number, delta: number) {
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setOrder(next);
  }

  return (
    <details>
      <summary>Edit reference board</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save({
            type: "update-collection",
            id: collection.id,
            revision: collection.revision,
            title,
            notes,
            order,
          });
        }}
      >
        <label>
          Board title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label>
          Your creative interpretation
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={3000}
          />
        </label>
        <p className="micro">
          Your notes are not provider explanations or verified facts.
        </p>
        <ol>
          {order.map((id, i) => (
            <li key={id}>
              {collection.items.find((candidate) => candidate.id === id)?.name}
              <button
                type="button"
                disabled={i === 0 || isBusy}
                onClick={() => move(i, -1)}
              >
                Move up
              </button>
              <button
                type="button"
                disabled={i === order.length - 1 || isBusy}
                onClick={() => move(i, 1)}
              >
                Move down
              </button>
            </li>
          ))}
        </ol>
        <button disabled={isBusy}>Save board changes</button>
      </form>
    </details>
  );
}
