import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  runtimeCulturalProvider,
  runtimeModelProvider,
} from "../../src/tools/runtime";
import manifest from "../fixtures/manifest.json";
import { readRecordingText } from "../../src/tools/recording-file";

describe("Lossless archived provider fixtures", () => {
  it.each(manifest.records)("retains original bytes for $file", (record) => {
    const text = readRecordingText(`tests/fixtures/${record.file}`);
    expect(createHash("sha256").update(text).digest("hex")).toBe(
      record.originalSha256,
    );
    expect(() => JSON.parse(text)).not.toThrow();

    if ("compressedSha256" in record) {
      expect(
        createHash("sha256")
          .update(readFileSync(`tests/fixtures/${record.file}`))
          .digest("hex"),
      ).toBe(record.compressedSha256);
    }
  });
  it("recorded and model-only setup do not open the live SQLite cache", () => {
    const directory = mkdtempSync(join(tmpdir(), "igor-no-cache-"));
    const blocker = join(directory, "file");
    writeFileSync(blocker, "A file cannot be used as a cache directory.");
    vi.stubEnv("IGOR_CACHE_PATH", join(blocker, "cache.sqlite"));
    vi.stubEnv("IGOR_QLOO_RECORDING", "tests/fixtures/qloo-cultural.json.gz");

    try {
      expect(() => runtimeCulturalProvider("qloo-live")).not.toThrow();
      expect(() => runtimeModelProvider("qloo-live")).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
      rmSync(directory, { recursive: true });
    }
  });
  it("rejects damaged gzip rather than treating it as a valid recording", () => {
    const directory = mkdtempSync(join(tmpdir(), "igor-recording-"));

    try {
      const path = join(directory, "damaged.json.gz");
      writeFileSync(path, "not gzip");
      expect(() => readRecordingText(path)).toThrow();
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
