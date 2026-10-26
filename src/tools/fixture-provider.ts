import { candidateIdentity } from "../core/identity";
import { z } from "zod";
import {
  CandidateInputSchema,
  type Entity,
  type ToolResult,
} from "../core/contracts";
import type {
  CulturalProvider,
  DiscoveryInput,
  PracticalFactsProvider,
} from "./interfaces";
import { mapProviderError } from "./qloo";

const known: Record<
  string,
  { name: string; type: Entity["type"]; metadata: string }
> = {
  radiohead: {
    name: "Radiohead",
    type: "artist",
    metadata: "English band · fixture identity",
  },
  "kendrick lamar": {
    name: "Kendrick Lamar",
    type: "artist",
    metadata: "American musician · fixture identity",
  },
  laufey: {
    name: "Laufey",
    type: "artist",
    metadata: "Icelandic musician · fixture identity",
  },
  "spirited away": {
    name: "Spirited Away",
    type: "movie",
    metadata: "2001 animated film · fixture identity",
  },
  arrival: {
    name: "Arrival",
    type: "movie",
    metadata: "2016 film · fixture identity",
  },
  moonlight: {
    name: "Moonlight",
    type: "movie",
    metadata: "2016 film · fixture identity",
  },
};

export class FixtureCulturalProvider implements CulturalProvider {
  async resolve(text: string): Promise<ToolResult<Entity>> {
    const normalizedValue = text.trim().toLowerCase();
    const hit = known[normalizedValue];
    const entity: Entity = {
      id: `seed:${normalizedValue}`,
      original: text,
      name: hit?.name ?? text,
      type: hit?.type ?? "artist",
      providerId: hit ? `fixture:${normalizedValue}` : null,
      status: hit
        ? "resolved"
        : normalizedValue === "phoenix"
          ? "ambiguous"
          : "unresolved",
      metadata: hit?.metadata ?? "No confirmed fixture identity",
      choices:
        normalizedValue === "phoenix"
          ? [
              {
                id: "fixture:phoenix-band",
                name: "Phoenix · French band",
                type: "artist",
              },
              {
                id: "fixture:phoenix-film",
                name: "Phoenix · 2014 film",
                type: "movie",
              },
            ]
          : [],
    };

    return {
      status:
        entity.status === "ambiguous" ? "ambiguous" : hit ? "ok" : "partial",
      data: entity,
      evidenceIds: [],
      warnings: hit
        ? []
        : ["Resolve this identity before using it as a cultural entity."],
      retry: "never",
      requestCount: 0,
    };
  }

  async discover(input: DiscoveryInput) {
    if (
      input.mode === "timeout" ||
      input.mode === "auth" ||
      input.mode === "rate-limit"
    ) {
      return {
        ...mapProviderError(
          input.mode === "auth"
            ? 401
            : input.mode === "rate-limit"
              ? 429
              : "timeout",
        ),
        data: { options: [], evidence: [] },
        requestCount: 0,
      };
    }

    const raw: unknown =
      input.mode === "malformed"
        ? { bad: true }
        : input.mode === "empty"
          ? []
          : input.catalogue;
    const parsed = z.array(CandidateInputSchema).safeParse(raw);

    if (!parsed.success) {
      return {
        ...mapProviderError("malformed"),
        data: { options: [], evidence: [] },
        requestCount: 0,
      };
    }

    const evidence = parsed.data.map((candidate) => ({
      id: `cultural:${candidate.id}:v${input.version}`,
      source: "illustrative-example" as const,
      at: new Date().toISOString(),
      reference: "Synthetic cultural fixture v1 · not a Qloo response",
      entityIds: [candidateIdentity(candidate)],
      summary: `${candidate.name}: illustrative associations with ${candidate.tags.join(", ")}.`,
      limitations: [
        "Synthetic tags and planning facts. No live cultural affinity or individual prediction.",
        "Fit values are application tag-overlap heuristics, not Qloo scores.",
      ],
      explanation: null,
      dependencies: [
        ...input.participants.map(
          (participant) => `preferences:${participant.id}`,
        ),
        "catalogue",
      ],
      freshness: "current" as const,
    }));

    return {
      status: parsed.data.length ? ("ok" as const) : ("empty" as const),
      data: { options: parsed.data, evidence },
      evidenceIds: evidence.map((evidence) => evidence.id),
      warnings: parsed.data.length
        ? ["Illustrative fixture provider. No external request was made."]
        : [
            "No candidates returned. Change the catalogue or retry after restoring normal fixture mode.",
          ],
      retry: "manual" as const,
      requestCount: 0,
    };
  }
}

export class SuppliedFactsProvider implements PracticalFactsProvider {
  async check(options: DiscoveryInput["catalogue"], location: string) {
    return {
      status: "ok" as const,
      data: options.map((candidate) =>
        candidate.location &&
        candidate.location.toLowerCase() !== location.toLowerCase()
          ? {
              ...candidate,
              cost: { ...candidate.cost, value: null },
              available: null,
            }
          : candidate,
      ),
      evidenceIds: [],
      warnings: [],
      retry: "never" as const,
      requestCount: 0,
    };
  }
}
