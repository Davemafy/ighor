import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./browser",
  testMatch: "connected-work.e2e.ts",
  outputDir: "../test-results/connected-work",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3550",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  projects: [
    { name: "desktop", use: {viewport: {width: 1440, height: 1000}} },
    { name: "mobile", use: {
      viewport: {width: 390, height: 844},
      isMobile: true, hasTouch: true, reducedMotion: "reduce",
    }},
    { name: "mobile-motion", use: {
      viewport: {width: 390, height: 844},
      isMobile: true, hasTouch: true, reducedMotion: "no-preference",
      video: "on",
    }},
  ],
  webServer: {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command: "npm start -- --port 3550",
    url: "http://127.0.0.1:3550/app",
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      IGOR_TEST_FIXTURES: "1",
      QLOO_API_KEY: "",
      GEMINI_API_KEY: "",
      LLM_API_KEY: "",
      LLM_MODEL: "",
      IGOR_QLOO_RECORDING: "",
      QLOO_MAX_CALLS: "0",
      IGOR_DB_PATH: ".igor/connected-e2e/tasks.sqlite",
      IGOR_AUTH_PATH: ".igor/connected-e2e/auth.sqlite",
      IGOR_OUTCOMES_PATH: ".igor/connected-e2e/outcomes.sqlite",
    },
  },
});
