import { readRecordingText } from "@/tools/recording-file";
import { QlooEnvelopeSchema, qlooRows } from "@/tools/qloo-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let cached: unknown = null;
export async function GET() {
  try {
    if (!cached) {
      const recording = JSON.parse(readRecordingText("tests/fixtures/qloo-cultural.json.gz"));
      const names = new Map<string, string>();
      for (const record of recording.qloo_records ?? []) {
        if (record.path !== "/search" || record.status !== "ok") continue;
        const parsed = QlooEnvelopeSchema.safeParse(record.response);
        if (parsed.success) for (const row of qlooRows(parsed.data)) names.set(row.entity_id, row.name);
      }
      const examples = [];
      for (const record of recording.qloo_records ?? []) {
        if (record.status !== "ok" || record.path !== "/v2/insights" || record.params?.["filter.type"] !== "urn:entity:place") continue;
        const parsed = QlooEnvelopeSchema.safeParse(record.response);
        if (!parsed.success) continue;
        const locality = parsed.data.query?.localities as { filter?: { name: string }[] } | undefined;
        if (locality?.filter?.length !== 1) continue;
        const seedIds = String(record.params["signal.interests.entities"] ?? "").split(",");
        const seeds = seedIds.map(id => names.get(id)).filter(Boolean);
        if (!seeds.length) continue;
        const places = qlooRows(parsed.data).filter(row => row.location && Number.isFinite(row.location.lat) && Number.isFinite(row.location.lon)).map((row, index) => ({ id: row.entity_id, name: row.name, lat: row.location!.lat, lon: row.location!.lon, rank: index + 1, description: String(row.properties?.description ?? row.properties?.short_description ?? "").slice(0, 400) }));
        if (places.length) examples.push({ city: locality.filter[0].name, seeds, seedIds, at: record.at, places });
      }
      cached = { source: "Qloo", delivery: "CACHED", examples, note: "Recorded Qloo responses. Example tastes, not your personal profile. Prices and availability have not been checked." };
    }
    return Response.json(cached, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "The recorded connections are unavailable. Please try the Igor app." }, { status: 503 });
  }
}
