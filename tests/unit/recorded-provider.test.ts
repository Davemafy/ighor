import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readRecordingText } from "../../src/tools/recording-file";

const recorded = z
  .object({
    records: z.array(
      z.object({
        params: z.object({ query: z.string(), types: z.string() }),
        response: z.unknown(),
      }),
    ),
  })
  .parse(JSON.parse(readRecordingText("tests/fixtures/qloo-search.json.gz")));

import {
  LiveQlooProvider,
  MemoryResponseCache,
} from "../../src/tools/qloo-live";

describe("Actual Actions search response replay (offline, not a fresh API test)", () => {
  it.each(recorded.records)(
    "resolves captured $params.query with its supplied category",
    async (record) => {
      const provider = new LiveQlooProvider(
        "offline-recorded-test-key",
        new MemoryResponseCache(),
        async () => Response.json(record.response),
      );
      const type = record.params.types.replace("urn:entity:", "") as
        "movie" | "artist";
      const result = await provider.resolve(record.params.query, type);
      expect(result.status).toBe(
        record.params.query === "Moonlight" ? "ambiguous" : "ok",
      );
      expect(result.data.name).toBe(record.params.query);

      if (record.params.query === "Moonlight") {
        expect(result.data.providerId).toBeNull();
      } else {
        expect(result.data.providerId).toBeTruthy();
      }

      expect(result.data.type).toBe(type);
    },
  );
});
