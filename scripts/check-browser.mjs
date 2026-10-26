import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

if (!existsSync(new URL("../.next/BUILD_ID", import.meta.url))) {
  console.error("Run npm run build before the browser suite.");
  process.exit(1);
}

const require = createRequire(import.meta.url);

const result = spawnSync(
  process.execPath,
  [
    require.resolve("@playwright/test/cli"),
    "test",
    "--config",
    "tests/playwright.config.mts",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
);

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
