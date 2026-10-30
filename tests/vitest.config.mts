import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Recordings contain original third-party API responses and are intentionally
// omitted from the public submission. Do not synthesize them or report these
// private-only suites as passing when their inputs are unavailable.
const replayFiles = [
  "tests/unit/broader-outcomes.test.ts",
  "tests/unit/conversation.test.ts",
  "tests/unit/gemini-model.test.ts",
  "tests/unit/place-discovery.test.ts",
  "tests/unit/recorded-conversation.test.ts",
  "tests/unit/recorded-provider.test.ts",
  "tests/unit/recorded-workflow.test.ts",
  "tests/unit/recording-file.test.ts",
];

const hasPrivateRecordings = existsSync(
  fileURLToPath(new URL("./fixtures/qloo-cultural.json.gz", import.meta.url)),
);

if (!hasPrivateRecordings) {
  console.warn(
    `Public submission: ${replayFiles.length} private-recording-dependent test suites are not run; no replacement Qloo data was invented.`,
  );
}

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    exclude: hasPrivateRecordings ? [] : replayFiles,
    environment: "node",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
});
