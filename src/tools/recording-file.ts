import { readFileSync, statSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/** Lossless fixture reader. Callers still validate JSON through the provider schema. */
export function readRecordingText(path: string): string {
  if (statSync(path).size > 32 * 1024 * 1024) {
    throw new Error("Recording file exceeds the size limit.");
  }

  const bytes = readFileSync(path);
  const json = path.endsWith(".gz")
    ? gunzipSync(bytes, { maxOutputLength: 32 * 1024 * 1024 })
    : bytes;

  return json.toString("utf8");
}
