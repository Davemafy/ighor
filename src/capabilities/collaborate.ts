import type { CandidateInput, Participant } from "../core/contracts";

const associations: Record<string, string[]> = {
  radiohead: ["indie", "ambient", "reflective"],
  "kendrick lamar": ["rhythmic", "drama"],
  laufey: ["jazz", "warm"],
  "spirited away": ["animation", "warm"],
  arrival: ["sci-fi", "reflective"],
  moonlight: ["drama", "indie"],
};

export function preferenceTags(value: string): string[] {
  const normalizedValue = value.trim().toLowerCase();

  return associations[normalizedValue] ?? [normalizedValue];
}

export function fitFor(candidate: CandidateInput, participants: Participant[]) {
  if (candidate.cultural) {
    return Object.fromEntries(
      participants.map((participant) => [
        participant.id,
        (candidate.cultural?.[participant.id] &&
        candidate.cultural[participant.id].signalScope !== "context"
          ? 1 / candidate.cultural[participant.id].rank
          : 0) -
          (participant.preferences.some(
            (preference) =>
              preference.confirmed &&
              preference.polarity === "dislike" &&
              preference.value.toLowerCase() === candidate.name.toLowerCase(),
          )
            ? 2
            : 0),
      ]),
    );
  }

  const fit: Record<string, number> = {};

  for (const participant of participants) {
    let score = 0;

    for (const preference of participant.preferences) {
      if (!preference.confirmed) {
        continue;
      }

      const matches = preferenceTags(preference.value).filter((t) =>
        candidate.tags.includes(t),
      ).length;

      if (preference.polarity === "like") {
        score += matches;
      }

      if (preference.polarity === "dislike") {
        score -= matches * 2;
      }
    }

    fit[participant.id] = score;
  }

  return fit;
}

export function groupUtility(fit: Record<string, number>): number {
  const values = Object.values(fit);

  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length +
        Math.min(...values) * 0.35
    : 0;
}
