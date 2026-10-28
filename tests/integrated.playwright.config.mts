import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const runDir = process.env.IGOR_BROWSER_RUN_DIR ?? ".igor/integration-browser";
export default defineConfig({
  testDir: "./browser",
  testMatch: "integrated-discovery.e2e.ts",
  outputDir: "../test-results/integrated",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3560",
    headless: true,
    trace: "on",
    video: "on",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command: "npm start -- --port 3560",
    url: "http://127.0.0.1:3560/app",
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      IGOR_TEST_FIXTURES: "1",
      QLOO_API_KEY: "",
      XAI_API_KEY: "",
      GROK_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      BRIGHTDATA_API_KEY: "",
      GEMINI_API_KEY: "",
      LLM_API_KEY: "",
      LLM_MODEL: "",
      IGOR_QLOO_RECORDING: "",
      QLOO_MAX_CALLS: "0",
      IGOR_DB_PATH: `${runDir}/tasks.sqlite`,
      IGOR_AUTH_PATH: `${runDir}/auth.sqlite`,
      IGOR_OUTCOMES_PATH: `${runDir}/outcomes.sqlite`,
    },
  },
});
