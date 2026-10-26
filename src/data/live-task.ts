import { freshTask } from "./fixtures";
import type { Task } from "../core/contracts";

export function freshLiveExample(id: string, owner: string): Task {
  const task = freshTask(id, owner);
  task.mode = "qloo-live";
  task.modelMode =
    process.env.GEMINI_API_KEY ||
    (process.env.LLM_API_KEY && process.env.LLM_MODEL)
      ? "tool-calling"
      : "scripted";
  task.catalogue = [];

  for (const participant of task.brief.participants) {
    for (const preference of participant.preferences) {
      if (
        ["Radiohead", "Kendrick Lamar", "Laufey"].includes(preference.value)
      ) {
        preference.entityType = "artist";
      }

      if (
        ["Spirited Away", "Arrival", "Moonlight"].includes(preference.value)
      ) {
        preference.entityType = "movie";
      }
    }
  }

  task.brief.suppliedFacts = [
    "Six illustrative profiles. Supply your own costs, minutes and access after retrieval.",
  ];
  task.brief.assumptions = [
    "No provider result or practical fact has been preloaded or invented.",
  ];

  return task;
}

/** Personal workspaces begin without illustrative people or cultural seeds. */
export function freshLiveTask(id: string, owner: string): Task {
  const task = freshLiveExample(id, owner);
  task.brief.participants = [];
  task.brief.suppliedFacts = [];
  task.brief.assumptions = [
    "USD, a $60 budget, 180 minutes and At home are editable starting defaults, not user-supplied facts.",
    "No tastes, prices, availability or venue facts have been supplied or verified.",
  ];

  return task;
}
