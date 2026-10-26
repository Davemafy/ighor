import { z } from "zod";
import {
  EntityType,
  type Entity,
  type Evidence,
  type CandidateInput,
  type Participant,
  type ToolResult,
} from "../core/contracts";
import type { DiscoveryInput } from "./interfaces";
export const QLOO_API_ORIGIN = "https://hackathon.api.qloo.com";
export const QlooEntitySchema = z.object({
  entity_id: z.string().uuid(),
  name: z.string().min(1),
  subtype: z.string().optional(),
  type: z.string().optional(),
  types: z.array(z.string()).optional(),
  disambiguation: z.unknown().optional(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    })
    .nullish(),
  properties: z.record(z.string(), z.unknown()).optional(),
  query: z
    .object({
      affinity: z.number().finite().nullish(),
      explainability: z.unknown().optional(),
    })
    .optional(),
});

export const QlooEnvelopeSchema = z.object({
  results: z.union([
    z.array(QlooEntitySchema),
    z.object({ entities: z.array(QlooEntitySchema) }),
  ]),
  query: z.record(z.string(), z.unknown()).optional(),
});

export type QlooBody = z.infer<typeof QlooEnvelopeSchema>;

export type CachedResponse = { body: QlooBody; at: string };

export function rowTypes(row: z.infer<typeof QlooEntitySchema>) {
  return [
    ...new Set(
      [row.subtype, row.type, ...(row.types ?? [])].flatMap((value) => {
        const parsed = EntityType.safeParse(value?.replace("urn:entity:", ""));

        return parsed.success ? [parsed.data] : [];
      }),
    ),
  ];
}

export class ProviderFailure extends Error {
  constructor(
    public status: ToolResult<null>["status"],
    message: string,
  ) {
    super(message);
  }
}

export function qlooRows(body: QlooBody) {
  return Array.isArray(body.results) ? body.results : body.results.entities;
}

export function explanationEntities(
  value: unknown,
): { entity_id: string; avg_score?: number; score?: number }[] {
  // Only recognized query.explainability contribution objects; never query metadata alone.
  const items: { entity_id: string; avg_score?: number; score?: number }[] = [];

  function walk(nodeValue: unknown, depth = 0) {
    if (depth > 5) {
      return;
    }

    if (Array.isArray(nodeValue)) {
      nodeValue.slice(0, 30).forEach((x) => walk(x, depth + 1));

      return;
    }

    if (nodeValue && typeof nodeValue === "object") {
      const record = nodeValue as Record<string, unknown>;

      if (
        typeof record.entity_id === "string" &&
        z.string().uuid().safeParse(record.entity_id).success
      ) {
        items.push({
          entity_id: record.entity_id,
          ...(typeof record.avg_score === "number" &&
          Number.isFinite(record.avg_score)
            ? { avg_score: record.avg_score }
            : {}),
          ...(typeof record.score === "number" && Number.isFinite(record.score)
            ? { score: record.score }
            : {}),
        });
      } else {
        Object.values(record)
          .slice(0, 30)
          .forEach((x) => walk(x, depth + 1));
      }
    }
  }

  walk(value);

  return [...new Map(items.map((x) => [x.entity_id, x])).values()];
}

export interface QlooResponse {
  body: QlooBody;
  at: string;
  delivery: "CACHED" | "LIVE";
  id: string;
  requests: number;
}
type DiscoveryProfile = Pick<Participant, "id" | "name" | "preferences">;
interface DiscoveryBatch {
  profile: DiscoveryProfile;
  seeds: string[];
  domain: Entity["type"];
  response: QlooResponse;
}

export function mergeDiscoveryResponse(
  input: DiscoveryInput,
  batch: DiscoveryBatch,
  merged: Map<string, CandidateInput>,
  evidence: Evidence[],
) {
  const { profile: p, seeds, domain, response: r } = batch;
  const allExplanation = explanationEntities(r.body.query?.explainability);
  const rows = qlooRows(r.body);

  for (const [index, row] of rows.entries()) {
    if (!rowTypes(row).includes(domain)) {
      throw new ProviderFailure(
        "error",
        "Qloo returned an unexpected entity domain.",
      );
    }

    const id = row.entity_id;
    const eid = `qloo:${r.id}:${p.id}:${id}`;
    const local = explanationEntities(row.query?.explainability);
    const contributors = local.length ? local : allExplanation;
    const existing = input.catalogue.find(
      (candidate) => candidate.providerId === id,
    );
    const old = merged.get(id);
    const fact = {
      value: null,
      source: "user-supplied" as const,
      reference: "Not supplied",
      at: r.at,
    };
    const properties = row.properties ?? {};
    const localities = z
      .object({
        localities: z.object({
          filter: z.array(
            z.object({
              entity_id: z.string().uuid(),
              name: z.string(),
              disambiguation: z.string().optional(),
            }),
          ),
        }),
      })
      .safeParse(r.body.query);
    const matched =
      localities.success && localities.data.localities.filter.length === 1
        ? localities.data.localities.filter[0]
        : null;

    if (domain === "place" && !matched) {
      throw new ProviderFailure(
        "error",
        "Locality match is missing or ambiguous; results cannot be attributed safely.",
      );
    }

    const image = z
      .object({ url: z.string().url() })
      .safeParse(
        properties.image ??
          (Array.isArray(properties.images) ? properties.images[0] : undefined),
      );
    const imageUrl =
      image.success &&
      new URL(image.data.url).protocol === "https:" &&
      new URL(image.data.url).hostname === "images.qloo.com"
        ? image.data.url
        : null;
    const website = z.string().url().safeParse(properties.website);
    const candidate: CandidateInput = old ?? {
      id,
      ...(domain === "place"
        ? {
            place: {
              latitude: row.location?.lat ?? null,
              longitude: row.location?.lon ?? null,
              address: String(properties.address ?? "").slice(0, 500),
              website:
                website.success && /^https?:\/\//.test(website.data)
                  ? website.data
                  : null,
              locality: matched
                ? {
                    id: matched.entity_id,
                    name: matched.name,
                    disambiguation: matched.disambiguation ?? "",
                  }
                : null,
            },
          }
        : {}),
      imageUrl,
      providerId: id,
      name: row.name.slice(0, 120),
      type: domain,
      tags: [],
      description: String(
        properties.description ?? properties.short_description ?? "",
      ).slice(0, 500),
      cost: existing?.cost.source === "user-supplied" ? existing.cost : fact,
      duration:
        existing?.duration.source === "user-supplied"
          ? existing.duration
          : fact,
      available:
        existing?.availabilitySource === "user-supplied"
          ? existing.available
          : null,
      availabilitySource: "user-supplied",
      location: existing?.location ?? null,
      sample: false,
      cultural: {},
    };
    candidate.cultural = {
      ...candidate.cultural,
      [p.id]: {
        signalScope: input.anchor ? "context" : "participant",
        affinity: row.query?.affinity ?? null,
        rank: index + 1,
        queryId: r.id,
        seedIds: seeds,
        explanationEntities: contributors,
        explanationScope: local.length
          ? "recommendation"
          : allExplanation.length
            ? "aggregate-query"
            : "none",
        delivery: r.delivery,
        retrievedAt: r.at,
      },
    };
    merged.set(id, candidate);
    evidence.push({
      id: eid,
      kind: "cultural",
      source: "provider-returned",
      delivery: r.delivery,
      at: r.at,
      reference: `${QLOO_API_ORIGIN}/v2/insights · query ${r.id}`,
      entityIds: [id],
      summary: `${p.name} · ${row.name}: returned rank ${index + 1}; query.affinity ${row.query?.affinity ?? "not provided"}.`,
      explanation: contributors.length
        ? JSON.stringify({
            scope: local.length ? "recommendation" : "aggregate-query",
            entities: contributors,
          })
        : null,
      limitations: [
        "Affinity is query-relative, not a probability. Missing from another person's list is unknown, not dislike.",
        "No price, access, runtime or availability has been verified.",
        ...(domain === "place"
          ? [
              `Requested locality: ${input.location}; Qloo matched ${matched?.name} (${matched?.disambiguation}). This is the returned locality scope, not a verified route or exact city boundary.`,
            ]
          : []),
      ],
      dependencies: input.anchor ? ["contextAnchor"] : [`preferences:${p.id}`],
      freshness: "current",
    });
  }
}

export function selectDiscoveryPool(
  merged: Map<string, CandidateInput>,
  evidence: Evidence[],
) {
  const options = [...merged.values()]
    .sort(
      (left, right) =>
        Object.keys(right.cultural ?? {}).length -
          Object.keys(left.cultural ?? {}).length ||
        reciprocalRankTotal(right) - reciprocalRankTotal(left),
    )
    .slice(0, 30);
  const ids = new Set(options.map((candidate) => candidate.id));

  return {
    options,
    evidence: evidence.filter((record) =>
      record.entityIds.some((id) => ids.has(id)),
    ),
  };
}

function reciprocalRankTotal(candidate: CandidateInput) {
  return Object.values(candidate.cultural ?? {}).reduce(
    (total, association) => total + 1 / association.rank,
    0,
  );
}
