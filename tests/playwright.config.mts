import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

function server(
  name: string,
  port: number,
  overrides: Record<string, string> = {},
) {
  return {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command: `npm start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      QLOO_API_KEY: "",
      GEMINI_API_KEY: "",
      LLM_API_KEY: "",
      QLOO_MAX_CALLS: "0",
      IGOR_TEST_FIXTURES: "",
      IGOR_QLOO_RECORDING: "",
      IGOR_DB_PATH: `.igor/e2e/${name}/tasks.sqlite`,
      IGOR_AUTH_PATH: `.igor/e2e/${name}/auth.sqlite`,
      IGOR_OUTCOMES_PATH: `.igor/e2e/${name}/outcomes.sqlite`,
      IGOR_CACHE_PATH: `.igor/e2e/${name}/cache.sqlite`,
      ...overrides,
    },
  };
}

export default defineConfig({
  testDir: "./browser",
  outputDir: fileURLToPath(
    new URL("../test-results/artifacts", import.meta.url),
  ),
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  use: { headless: true, viewport: { width: 1440, height: 1100 } },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: fileURLToPath(
          new URL("../test-results/results.json", import.meta.url),
        ),
      },
    ],
  ],
  // Each provider mode has separate state. No project inherits live credentials.
  webServer: [
    server("workspace", 3100, { IGOR_TEST_FIXTURES: "1" }),
    server("provider-boundary", 3200),
    server("recorded", 3400, {
      IGOR_QLOO_RECORDING: "tests/fixtures/qloo-cultural.json.gz",
    }),
  ],
  projects: [
    {
      name: "connected-work",
      testMatch: "connected-work.e2e.ts",
      use: { baseURL: "http://127.0.0.1:3100" },
    },
    {
      name: "home",
      testMatch: "home.e2e.ts",
      use: { baseURL: "http://127.0.0.1:3100" },
    },
    {
      name: "workspace",
      testMatch: "workspace.e2e.ts",
      use: { baseURL: "http://127.0.0.1:3100" },
    },
    {
      name: "provider-boundary",
      testMatch: "live-workspace.e2e.ts",
      use: { baseURL: "http://127.0.0.1:3200" },
    },
    {
      name: "continuity",
      testMatch: "vision.e2e.ts",
      use: { baseURL: "http://127.0.0.1:3400" },
    },
    {
      name: "broader-outcomes",
      testMatch: "broader.e2e.ts",
      use: { baseURL: "http://127.0.0.1:3400" },
    },
  ],
});
