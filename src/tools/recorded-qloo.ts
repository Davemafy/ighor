import { createHash } from "node:crypto";
import { z } from "zod";
import {
  LiveQlooProvider,
  MemoryResponseCache,
  QlooEnvelopeSchema,
} from "./qloo-live";

const Recording = z.object({
  qloo_records: z
    .array(
      z.object({
        path: z.enum(["/search", "/v2/insights"]),
        params: z.record(z.string(), z.string()),
        status: z.string(),
        at: z.string().refine((v) => Number.isFinite(Date.parse(v))),
        response: z.unknown().optional(),
      }),
    )
    .max(60),
});

const namespace = "igor-recorded-response-cache-namespace";

/** Actual archived responses only. Every hit is CACHED at its original retrieval time. */
export class RecordedQlooProvider extends LiveQlooProvider {
  constructor(raw: unknown) {
    const cache = new MemoryResponseCache(30 * 86400000);
    const recording = Recording.parse(raw);

    for (const record of recording.qloo_records) {
      if (record.status !== "ok") {
        continue;
      }

      const body = QlooEnvelopeSchema.parse(record.response);
      const url =
        "https://hackathon.api.qloo.com" +
        record.path +
        "?" +
        new URLSearchParams(
          Object.entries(record.params).sort(([a], [b]) => a.localeCompare(b)),
        );
      const key = createHash("sha256")
        .update(namespace + "\0" + url)
        .digest("hex");
      cache.set(key, { body, at: record.at });
    }

    super(
      namespace,
      cache,
      async () => {
        throw new Error("Recorded provider prohibits network access.");
      },
      0,
      true,
    );
  }
}
