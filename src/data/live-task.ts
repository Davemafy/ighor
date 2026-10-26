import { freshTask } from "./fixtures";
import type { Task } from "../core/contracts";

export function freshLiveTask(id: string, owner: string): Task {
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
