import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  testMatch: "canvas.e2e.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3500",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm start -- --port 3500",
    url: "http://127.0.0.1:3500/app",
    reuseExistingServer: false,
    env: {
      IGOR_DB_PATH: ".igor/canvas-e2e/tasks.sqlite",
      IGOR_AUTH_PATH: ".igor/canvas-e2e/auth.sqlite",
      IGOR_OUTCOMES_PATH: ".igor/canvas-e2e/outcomes.sqlite",
      IGOR_TEST_FIXTURES: "1",
      QLOO_API_KEY: "",
      GEMINI_API_KEY: "",
      LLM_API_KEY: "",
      IGOR_QLOO_RECORDING: "",
      QLOO_MAX_CALLS: "0",
    },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        contextOptions: { reducedMotion: "reduce" },
      },
    },
    {
      name: "mobile-small",
      use: {
        viewport: {width: 320, height: 740},
        isMobile: true,
        hasTouch: true,
        contextOptions: { reducedMotion: "reduce" },
      },
    },
    {
      name: "mobile-wide",
      use: {
        viewport: {width: 430, height: 932},
        isMobile: true,
        hasTouch: true,
        contextOptions: { reducedMotion: "reduce" },
      },
    },
    {
      name: "mobile-motion",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        contextOptions: { reducedMotion: "no-preference" },
        video: "on",
      },
    },
  ],
});
