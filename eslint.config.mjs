import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      curly: ["error", "all"],
      "one-var": ["error", "never"],
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "return" },
        { blankLine: "always", prev: "block-like", next: "*" },
        { blankLine: "always", prev: "*", next: "block-like" },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
]);
