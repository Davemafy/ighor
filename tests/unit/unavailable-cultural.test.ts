import { it, expect } from "vitest";
import { runtimeCulturalProvider } from "../../src/tools/runtime";
it("preserves a blocked observation when a recording is unavailable without external calls or fake results", async () => {
  const before = process.env.IGOR_QLOO_RECORDING;
  process.env.IGOR_QLOO_RECORDING = "/not-a-real-igor-recording.json.gz";

  try {
    const provider = runtimeCulturalProvider("qloo-live");
    const result = await provider.resolve("Radiohead", "artist");
    expect(result.status).toBe("blocked");
    expect(result.data.providerId).toBeNull();
    expect(result.requestCount).toBe(0);
    expect(result.warnings.join(" ")).toContain("missing or invalid");
  } finally {
    if (before === undefined) {
      delete process.env.IGOR_QLOO_RECORDING;
    } else {
      process.env.IGOR_QLOO_RECORDING = before;
    }
  }
});
