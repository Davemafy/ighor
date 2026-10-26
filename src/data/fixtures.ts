import type { CandidateInput, Participant, Task } from "../core/contracts";

export const fixtureDate = "2026-10-24T00:00:00.000Z";

const people = [
  ["amara", "Amara", ["Radiohead", "indie", "reflective"], ["horror"]],
  ["leo", "Leo", ["Kendrick Lamar", "rhythmic", "drama"], ["ambient"]],
  ["june", "June", ["Spirited Away", "animation", "warm"], ["intense"]],
  ["sam", "Sam", ["Arrival", "sci-fi", "reflective"], ["romance"]],
  ["noor", "Noor", ["Laufey", "jazz", "warm"], ["horror"]],
  ["eli", "Eli", ["Moonlight", "drama", "indie"], ["action"]],
] as const;

export function sampleParticipants(): Participant[] {
  return people.map(([id, name, likes, dislikes]) => ({
    id,
    name,
    sample: true,
    preferences: [
      ...likes.map((value) => ({
        id: `${id}:${value}`,
        subject: id,
        value,
        polarity: "like" as const,
        source: "illustrative-example" as const,
        confirmed: true,
        scope: "participant" as const,
      })),
      ...dislikes.map((value) => ({
        id: `${id}:no:${value}`,
        subject: id,
        value,
        polarity: "dislike" as const,
        source: "illustrative-example" as const,
        confirmed: true,
        scope: "participant" as const,
      })),
    ],
  }));
}

const rows: [
  string,
  string,
  CandidateInput["type"],
  string[],
  number | null,
  number | null,
  boolean | null,
  string,
][] = [
  [
    "moonrise",
    "Moonrise Kingdom",
    "movie",
    ["indie", "warm", "reflective"],
    18,
    94,
    true,
    "A small, offbeat story with room for a generous conversation.",
  ],
  [
    "arrival",
    "Arrival",
    "movie",
    ["sci-fi", "reflective", "drama"],
    32,
    116,
    true,
    "A contemplative science-fiction direction; less light-hearted.",
  ],
  [
    "spirited",
    "Spirited Away",
    "movie",
    ["animation", "warm", "reflective"],
    12,
    125,
    true,
    "An imaginative shared starting point, with a longer running time.",
  ],
  [
    "moonlight",
    "Moonlight",
    "movie",
    ["drama", "indie", "reflective"],
    24,
    111,
    true,
    "An intimate drama; the tone deserves an explicit group decision.",
  ],
  [
    "premium",
    "A premium screening",
    "movie",
    ["action", "intense"],
    85,
    100,
    true,
    "A deliberately expensive sample option to exercise budget rules.",
  ],
  [
    "unknown",
    "The unconfirmed screening",
    "movie",
    ["indie", "drama"],
    null,
    105,
    null,
    "Cost and access have not been supplied. Kept for review.",
  ],
  [
    "long",
    "The long double feature",
    "movie",
    ["sci-fi", "drama"],
    20,
    210,
    true,
    "An option that exceeds the sample evening.",
  ],
  [
    "quiet",
    "Quiet currents",
    "artist",
    ["ambient", "indie", "reflective"],
    4,
    15,
    true,
    "A fictional ambient listening selection; Leo may prefer another direction.",
  ],
  [
    "warm",
    "Warm frequencies",
    "artist",
    ["jazz", "rhythmic", "warm"],
    6,
    15,
    true,
    "A fictional listening selection that bridges jazz and rhythmic interests.",
  ],
];

export function sampleCatalogue(): CandidateInput[] {
  return rows.map(
    ([id, name, type, tags, cost, duration, available, description]) => ({
      id,
      providerId: `fixture:${type}:${id}`,
      name,
      type,
      tags,
      description,
      cost: {
        value: cost,
        source: "illustrative-example",
        reference:
          "Synthetic planning catalogue · group cost, not a live price",
        at: fixtureDate,
      },
      duration: {
        value: duration,
        source: "illustrative-example",
        reference: "Illustrative planning duration; not independently verified",
        at: fixtureDate,
      },
      available,
      availabilitySource: "illustrative-example",
      location: null,
      sample: true,
    }),
  );
}

export function freshTask(id: string, owner: string): Task {
  return {
    id,
    brief: {
      goal: "",
      owner,
      participants: sampleParticipants(),
      constraints: {
        budget: 60,
        duration: 180,
        location: "At home",
        currency: "USD",
      },
      selected: [],
      unresolved: [],
      suppliedFacts: [
        "Six sample profiles and sample catalogue supplied for local development.",
      ],
      assumptions: [
        "USD group budget and 180 minutes are editable sample defaults.",
        "No live prices, availability, cultural affinities or venue facts are verified.",
      ],
      version: 0,
      kind: "gathering",
    },
    catalogue: sampleCatalogue(),
    candidates: [],
    entities: [],
    evidence: [],
    artifacts: [],
    trace: [],
    messages: [],
    schedule: [],
    status: "draft",
    mode: "illustrative-fixtures",
    simulation: "none",
    preferences: [],
    error: null,
  };
}
