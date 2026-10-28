"use client";

import { useEffect, useState } from "react";
import type { Task, TaskAction } from "@/core/contracts";
import type { OutputAction } from "@/core/outcomes";
import type {
  StoredCollection,
  StoredShare,
  StoredReview,
  StoredAssessment,
} from "@/data/outcome-store";

export type SavedCollection = StoredCollection & { sourceChanged: boolean };
export type BlindComparison = Pick<
  StoredAssessment,
  "id" | "A" | "B" | "sourceVersion"
>;
interface SavedOutputs {
  collections: SavedCollection[];
  shares: StoredShare[];
  reviews: StoredReview[];
}
interface OutputResults {
  collection: StoredCollection;
  "update-collection": StoredCollection;
  "delete-collection": { status: "deleted" };
  share: StoredShare & { path: string; token: string };
  revoke: { status: "revoked" };
  "accept-review": { status: "accepted" | "acknowledged"; task?: Task };
  "blind-comparison": BlindComparison;
  assessment: StoredAssessment;
}
export type SaveOutput = <Kind extends OutputAction["type"]>(
  input: Extract<OutputAction, { type: Kind }>,
) => Promise<OutputResults[Kind] | null>;

export function useSavedOutcomes(
  task: Task,
  onTask: (task: Task) => void,
  onTurn: (action: TaskAction) => Promise<void>,
) {
  const [data, setData] = useState<SavedOutputs>({
    collections: [],
    shares: [],
    reviews: [],
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const endpoint = `/api/tasks/${task.id}/outputs`;

  async function refresh() {
    const response = await fetch(endpoint);

    if (response.ok) {
      setData(await response.json());
    }
  }

  useEffect(() => {
    let active = true;

    async function loadSavedOutputs() {
      setIsLoading(true);

      try {
        const response = await fetch(endpoint);

        if (!response.ok) {
          throw new Error("Could not load saved work.");
        }

        const savedOutputs = await response.json();

        if (active) {
          setData(savedOutputs);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not load saved work.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadSavedOutputs();

    return () => {
      active = false;
    };
  }, [endpoint]);

  const saveOutput: SaveOutput = async (input) => {
    setIsBusy(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, version: task.brief.version }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not save.");
      }

      if (result.task) {
        onTask(result.task);
      }

      await refresh();
      setStatusMessage("Saved.");

      return result;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save.",
      );

      return null;
    } finally {
      setIsBusy(false);
    }
  };

  async function recallPreference(preferenceId: string, participantId: string) {
    setIsBusy(true);

    try {
      await onTurn({ type: "recall", preferenceId, participantId });
      setStatusMessage("Applied saved preference to the chosen participant.");
    } finally {
      setIsBusy(false);
    }
  }

  return {
    data,
    errorMessage,
    statusMessage,
    setStatusMessage,
    isBusy,
    isLoading,
    refresh,
    saveOutput,
    recallPreference,
  };
}
