import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// An explicit offline command must not inherit credentials that could trigger model spend.
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "0.0.0.0",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      IGOR_QLOO_RECORDING: "tests/fixtures/qloo-cultural.json.gz",
      QLOO_API_KEY: "",
      GEMINI_API_KEY: "",
      LLM_API_KEY: "",
    },
  },
);

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
