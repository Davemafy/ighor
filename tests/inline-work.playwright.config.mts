import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./browser",
  testMatch: "inline-work.e2e.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3580",
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command: "npm start -- --port 3580",
    url: "http://127.0.0.1:3580/app",
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      IGOR_TEST_FIXTURES: "1",
      QLOO_API_KEY: "",
      GEMINI_API_KEY: "",
      LLM_API_KEY: "",
      QLOO_MAX_CALLS: "0",
      IGOR_DB_PATH: ".igor/inline-work-e2e/tasks.sqlite",
      IGOR_AUTH_PATH: ".igor/inline-work-e2e/auth.sqlite",
      IGOR_OUTCOMES_PATH: ".igor/inline-work-e2e/outcomes.sqlite",
    },
  },
});
