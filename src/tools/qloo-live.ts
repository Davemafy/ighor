import { z } from "zod";
import { readResponseText, ResponseBodyError } from "./response-body";
import { createHash } from "node:crypto";
import type {
  Entity,
  Evidence,
  CandidateInput,
  Participant,
  ToolResult,
} from "../core/contracts";
import type { CulturalProvider, DiscoveryInput, LocalPlaceResult } from "./interfaces";
import { MemoryResponseCache, type ResponseCache } from "./qloo-cache";
import {
  QLOO_API_ORIGIN,
  QlooEnvelopeSchema,
  type QlooBody,
  ProviderFailure,
  qlooRows,
  rowTypes,
  mergeDiscoveryResponse,
  selectDiscoveryPool,
} from "./qloo-response";
export {
  MemoryResponseCache,
  SqliteResponseCache,
  type ResponseCache,
} from "./qloo-cache";
export {
  QlooEnvelopeSchema,
  qlooRows,
  explanationEntities,
} from "./qloo-response";
export class LiveQlooProvider implements CulturalProvider {
  timeoutMs = 120000;

  private deadline = Date.now() + 110000;

  calls = 0;

  constructor(
    private key: string,
    private cache: ResponseCache = new MemoryResponseCache(),
    private transport: typeof fetch = fetch,
    private maxCalls = 30,
    private cacheOnly = false,
  ) {}

  async request(
    path: "/search" | "/v2/insights",
    params: Record<string, string>,
  ) {
    const entries = Object.entries(params).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const url = QLOO_API_ORIGIN + path + "?" + new URLSearchParams(entries);
    // Credential fingerprint namespaces local cache without persisting the key.
    const id = createHash("sha256")
      .update(this.key + "\0" + url)
      .digest("hex");
    const hit = this.cache.get(id);

    if (hit) {
      return { ...hit, delivery: "CACHED" as const, id, requests: 0 };
    }

    if (this.cacheOnly) {
      throw new ProviderFailure(
        "blocked",
        "Cache-only demo: this request has not been preloaded. No live request was made.",
      );
    }

    if (!this.key) {
      throw new ProviderFailure(
        "blocked",
        "Qloo key is not configured on this server. No request was made.",
      );
    }

    if (this.calls >= this.maxCalls || Date.now() > this.deadline) {
      throw new ProviderFailure(
        "partial",
        "Qloo per-run request/time cap reached. Cached results remain available.",
      );
    }

    this.calls++;
    let response: Response;

    try {
      response = await this.transport(url, {
        headers: { "X-Api-Key": this.key, Accept: "application/json" },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      throw new ProviderFailure(
        "error",
        "Qloo request failed or timed out; no retry was made.",
      );
    }

    if (!response.ok) {
      throw new ProviderFailure(
        response.status === 401 || response.status === 403
          ? "blocked"
          : "error",
        response.status === 429
          ? "Qloo rate limit reached; no retry was made."
          : `Qloo returned HTTP ${response.status}.`,
      );
    }

    const length = Number(response.headers.get("content-length") ?? 0);

    if (length > 1000000) {
      throw new ProviderFailure("error", "Qloo response too large.");
    }

    let responseText: string;

    try {
      responseText = await readResponseText(response, 1000000);
    } catch (error) {
      if (error instanceof ResponseBodyError) {
        throw new ProviderFailure(
          "error",
          error.reason === "missing"
            ? "Qloo response body missing."
            : "Qloo response too large.",
        );
      }

      throw error;
    }

    let body: QlooBody;

    try {
      body = QlooEnvelopeSchema.parse(JSON.parse(responseText));
    } catch {
      throw new ProviderFailure(
        "error",
        "Qloo response schema was not recognized.",
      );
    }

    if (JSON.stringify(body).includes(this.key)) {
      throw new ProviderFailure("error", "Unsafe provider response rejected.");
    }

    const at = new Date().toISOString();
    this.cache.set(id, { body, at });

    return { body, at, delivery: "LIVE" as const, id, requests: 1 };
  }

  private failure<T>(e: unknown, start: number, data: T): ToolResult<T> {
    return {
      status: e instanceof ProviderFailure ? e.status : "error",
      data,
      evidenceIds: [],
      warnings: [
        e instanceof ProviderFailure
          ? e.message
          : "Provider response rejected safely.",
      ],
      retry: "manual",
      requestCount: this.calls - start,
    };
  }

  /**
   * Geography/category place exploration can start without an artist/movie
   * seed. Qloo's documented locality and restaurant-tag filters are genuine
   * lookup signals; they are NOT personalized affinity or proof that a
   * particular game, price or reservation is available.
   */
  async exploreLocality(
    location: string,
    interests: string,
  ): Promise<ToolResult<LocalPlaceResult>> {
    const start = this.calls;
    const empty: LocalPlaceResult = { places: [], evidence: [] };
    if (
      !location.trim() ||
      location.length > 100 ||
      !/\b(?:dining|dinning|restaurant|cafe|food|dinner|lunch|brunch|eat)\b/i.test(
        interests,
      )
    ) {
      return {
        status: "blocked",
        data: empty,
        warnings: ["No grounded local dining category for a Qloo place query."],
        evidenceIds: [],
        retry: "never",
        requestCount: 0,
      };
    }

    try {
      const response = await this.request("/v2/insights", {
        "filter.type": "urn:entity:place",
        "filter.location.query": location.trim(),
        "filter.location.radius": "0",
        // This is a category filter, not a claim of preference affinity.
        "filter.tags": "urn:tag:genre:place:restaurant",
        take: "8",
      });
      const localities = z
        .object({
          localities: z.object({
            filter: z.array(
              z.object({
                entity_id: z.string().uuid(),
                name: z.string(),
              }),
            ),
          }),
        })
        .safeParse(response.body.query);
      // Locality filtering must be confirmed from the returned query, not
      // merely assumed from request parameters.
      if (!localities.success || localities.data.localities.filter.length !== 1) {
        return {
          status: "partial",
          data: empty,
          warnings: ["Qloo did not confirm one unambiguous requested locality."],
          evidenceIds: [],
          retry: "manual",
          requestCount: this.calls - start,
        };
      }
      const matched = localities.data.localities.filter[0];
      const rows = qlooRows(response.body)
        .filter((row) => rowTypes(row).includes("place"))
        .slice(0, 8);
      const places = rows.map((row) => {
        const website = z.string().url().safeParse(row.properties?.website);
        const address =
          typeof row.properties?.address === "string"
            ? row.properties.address.slice(0, 300)
            : "";
        return {
          providerId: row.entity_id,
          name: row.name.slice(0, 120),
          description: String(
            row.properties?.short_description ??
              row.properties?.description ??
              "",
          ).slice(0, 320),
          website:
            website.success && website.data.startsWith("https://")
              ? website.data
              : null,
          address,
          latitude: row.location?.lat ?? null,
          longitude: row.location?.lon ?? null,
        };
      });
      const evidence = places.map((place, index) => ({
        id: `qloo:local:${response.id}:${place.providerId}`,
        kind: "cultural" as const,
        source: "provider-returned" as const,
        delivery: response.delivery,
        at: response.at,
        reference: `${QLOO_API_ORIGIN}/v2/insights · query ${response.id}`,
        entityIds: [place.providerId],
        summary: `Qloo locality/category result ${index + 1}: ${place.name}; matched ${matched.name}. ${place.address}`.slice(0, 450),
        limitations: [
          "Location and restaurant-category match only; not personalized taste affinity.",
          "Board games, Saturday hours, group seating, prices and reservations have not been verified.",
        ],
        explanation: null,
        dependencies: ["location", "category:restaurant"],
        freshness: "current" as const,
      }));
      return {
        status: places.length ? "ok" : "empty",
        data: { places, evidence },
        evidenceIds: evidence.map((entry) => entry.id),
        warnings: places.length
          ? []
          : ["Qloo returned no matching restaurant places in this locality."],
        retry: "manual",
        requestCount: this.calls - start,
      };
    } catch (error) {
      return this.failure(error, start, empty);
    }
  }

  async resolve(
    text: string,
    type?: Entity["type"],
  ): Promise<ToolResult<Entity>> {
    const start = this.calls;
    const empty: Entity = {
      id: `seed:${text.toLowerCase()}`,
      original: text,
      name: text,
      type: type ?? "artist",
      providerId: null,
      status: "unresolved",
      metadata: "Identity unresolved",
      choices: [],
    };

    try {
      const response = await this.request("/search", {
        query: text,
        types: type
          ? `urn:entity:${type}`
          : "urn:entity:movie,urn:entity:tv_show,urn:entity:artist",
        take: "10",
      });
      const rows = qlooRows(response.body).flatMap((x) =>
        rowTypes(x)
          .filter((t) => !type || t === type)
          .map((t) => ({
            id: x.entity_id,
            name: x.name,
            type: t,
            metadata: JSON.stringify({
              releaseYear: x.properties?.release_year ?? null,
              disambiguation: x.disambiguation ?? null,
            }).slice(0, 500),
          })),
      );
      const exact = rows.filter(
        (x) =>
          x.name.normalize("NFKC").toLowerCase() ===
          text.normalize("NFKC").toLowerCase(),
      );
      const choices = exact.length ? exact : rows;

      if (choices.length === 1 && exact.length === 1) {
        return {
          status: "ok",
          data: {
            ...empty,
            ...choices[0],
            id: empty.id,
            providerId: choices[0].id,
            status: "resolved",
            metadata: `${response.delivery} Qloo /search · ${response.at}`,
          },
          evidenceIds: [],
          warnings: [],
          retry: "never",
          requestCount: response.requests,
        };
      }

      return {
        status: choices.length > 1 ? "ambiguous" : "partial",
        data: {
          ...empty,
          status: choices.length > 1 ? "ambiguous" : "unresolved",
          choices: choices.length > 1 ? choices : [],
          metadata: `${response.delivery} search: explicit identity selection required`,
        },
        evidenceIds: [],
        warnings: ["No unique exact identity; confirm the intended match."],
        retry: "never",
        requestCount: response.requests,
      };
    } catch (error) {
      return this.failure(error, start, empty);
    }
  }

  async discover(
    input: DiscoveryInput,
  ): Promise<ToolResult<{ options: CandidateInput[]; evidence: Evidence[] }>> {
    const start = this.calls;
    const merged = new Map<string, CandidateInput>();
    const evidence: Evidence[] = [];
    const warnings: string[] = [];

    try {
      const profiles = input.anchor
        ? [
            {
              id: "context",
              name: `Context: ${input.anchor.name}`,
              preferences: [],
            },
          ]
        : input.participants;

      for (const profile of profiles) {
        const seeds = await this.resolveProfileSeeds(profile, input, warnings);

        if (!seeds.length) {
          warnings.push(
            `${profile.name}: no confirmed seeds. No cultural preference has been inferred.`,
          );
          continue;
        }

        for (const domain of input.targetTypes ??
          (["movie", "tv_show", "artist"] as const)) {
          const response = await this.request("/v2/insights", {
            "filter.type": `urn:entity:${domain}`,
            ...(domain === "place"
              ? {
                  "filter.location.query": input.location,
                  "filter.location.radius": "0",
                }
              : {}),
            "signal.interests.entities": [...new Set(seeds)].sort().join(","),
            "feature.explainability": "true",
            take: "10",
          });
          mergeDiscoveryResponse(
            input,
            { profile: profile, seeds, domain, response: response },
            merged,
            evidence,
          );
        }
      }
    } catch (error) {
      warnings.push(...this.failure(error, start, null).warnings);

      if (!merged.size) {
        return this.failure(error, start, { options: [], evidence: [] });
      }
    }

    const { options, evidence: kept } = selectDiscoveryPool(merged, evidence);

    return {
      status: options.length ? (warnings.length ? "partial" : "ok") : "empty",
      data: { options, evidence: kept },
      evidenceIds: kept.map((evidence) => evidence.id),
      warnings,
      retry: "manual",
      requestCount: this.calls - start,
    };
  }
  private async resolveProfileSeeds(
    profile: Pick<Participant, "id" | "name" | "preferences">,
    input: DiscoveryInput,
    warnings: string[],
  ) {
    const seeds: string[] = input.anchor ? [input.anchor.providerId] : [];

    for (const preference of profile.preferences
      .filter(
        (x) =>
          x.confirmed &&
          x.polarity === "like" &&
          (x.entityType || /^[A-Z]/.test(x.value)),
      )
      .slice(0, 4)) {
      const confirmed = input.entities?.find(
        (entity) =>
          entity.original === preference.value &&
          entity.status === "resolved" &&
          (!preference.entityType || preference.entityType === entity.type),
      );

      if (confirmed?.providerId) {
        seeds.push(confirmed.providerId);
        continue;
      }

      const result = await this.resolve(
        preference.value,
        preference.entityType,
      );

      if (result.status === "blocked" || result.status === "error") {
        throw new ProviderFailure(result.status, result.warnings.join(" "));
      }

      if (result.data.status === "resolved") {
        seeds.push(result.data.providerId!);
      } else {
        warnings.push(
          `${profile.name}: ${preference.value} remains unresolved; not used as a seed.`,
        );
      }
    }

    return seeds;
  }
}
