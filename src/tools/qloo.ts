import { z } from "zod";
import { EntityType, type ToolResult } from "../core/contracts";

const ProviderEntity = z.object({
  entity_id: z.string().min(1),
  name: z.string().min(1),
  subtype: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const Envelope = z.object({
  results: z.object({ entities: z.array(ProviderEntity) }),
  query: z.record(z.string(), z.unknown()).optional(),
});

export function normalizeQloo(payload: unknown) {
  const body = Envelope.parse(payload);
  const candidates = body.results.entities.map((entityRow) => ({
    providerId: entityRow.entity_id,
    name: entityRow.name,
    type: EntityType.parse(entityRow.subtype.replace("urn:entity:", "")),
  }));

  // This is an unverified offline envelope hypothesis, not a live API contract.
  // No explanation mapping is trusted until verified against current provider docs/payloads.
  return {
    candidates,
    explanation: null,
    status: candidates.length ? "ok" : "empty",
  };
}

export function mapProviderError(status: number | string): ToolResult<null> {
  const messages: Record<string, string> = {
    "401": "Provider authentication is unavailable.",
    "403": "Provider access was denied.",
    "429": "Provider request limit reached.",
    timeout: "Provider timed out.",
    malformed: "Provider response did not match the supported contract.",
  };

  return {
    status: status === 401 || status === 403 ? "blocked" : "error",
    data: null,
    evidenceIds: [],
    warnings: [messages[String(status)] ?? "Provider request failed."],
    retry: status === 429 || status === "timeout" ? "manual" : "never",
    requestCount: 1,
  };
}

export function safeSerialize(value: unknown): string {
  function clean(v: unknown, depth = 0): unknown {
    if (depth > 8) {
      return "[depth limit]";
    }

    if (Array.isArray(v)) {
      return v.slice(0, 40).map((x) => clean(x, depth + 1));
    }

    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v)
          .slice(0, 60)
          .map(([k, x]) => [
            k,
            /key|authorization|token|secret|password|email|phone|cookie/i.test(
              k,
            )
              ? "[redacted]"
              : clean(x, depth + 1),
          ]),
      );
    }

    if (typeof v === "string") {
      return v
        .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/(?:sk-|qloo_)[a-zA-Z0-9_-]{8,}/g, "[redacted]")
        .slice(0, 2000);
    }

    return v;
  }

  return JSON.stringify(clean(value));
}
