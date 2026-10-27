import { LiveQlooProvider, SqliteResponseCache } from "./qloo-live";
import { GrokModel } from "./grok-model";
import { FallbackModel } from "./fallback-model";
import { ToolCallingModel } from "./tool-model";
import { ResponsiveGeminiModel } from "./responsive-gemini";
import { RecordedQlooProvider } from "./recorded-qloo";
import { readRecordingText } from "./recording-file";
import { DevelopmentModel } from "./development-model";
import { FixtureCulturalProvider } from "./fixture-provider";
import type { Task } from "../core/contracts";

let cache: SqliteResponseCache | undefined;

/** Open the cultural cache only when this execution actually needs a live provider. */
export function runtimeCulturalProvider(mode: Task["mode"]) {
  if (mode === "illustrative-fixtures") {
    return new FixtureCulturalProvider();
  }

  if (process.env.IGOR_QLOO_RECORDING) {
    return new RecordedQlooProvider(
      JSON.parse(readRecordingText(process.env.IGOR_QLOO_RECORDING)),
    );
  }

  cache ??= new SqliteResponseCache(
    process.env.IGOR_CACHE_PATH ?? `${process.cwd()}/.igor/qloo-cache.sqlite`,
    Math.max(1, Math.min(30, Number(process.env.QLOO_CACHE_DAYS) || 1)) *
      86400000,
  );
  const configured = Number(process.env.QLOO_MAX_CALLS ?? "30");
  const max =
    Number.isInteger(configured) && configured >= 0
      ? Math.min(30, configured)
      : 0;

  return new LiveQlooProvider(
    process.env.QLOO_API_KEY ?? "",
    cache,
    fetch,
    max,
    process.env.QLOO_CACHE_ONLY === "1",
  );
}

export function runtimeModelProvider(mode: Task["mode"]) {
  if (mode === "illustrative-fixtures") {
    return new DevelopmentModel();
  }

  const grokKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  const backup = grokKey
    ? new GrokModel(
        grokKey,
        process.env.XAI_MODEL || process.env.GROK_MODEL || "grok-4.3",
      )
    : process.env.LLM_API_KEY && process.env.LLM_MODEL
      ? new ToolCallingModel(process.env.LLM_API_KEY, process.env.LLM_MODEL)
      : undefined;
  if (process.env.GEMINI_API_KEY) {
    const primary = new ResponsiveGeminiModel(
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
    );
    return backup ? new FallbackModel(primary, backup) : primary;
  }
  return (
    backup ??
    (process.env.IGOR_TEST_FIXTURES === "1" ||
    process.env.IGOR_QLOO_RECORDING ||
    process.env.NODE_ENV === "test"
      ? new DevelopmentModel()
      : {
          executionMode: "tool-calling" as const,
          async interpret(): Promise<never> {
            throw new Error(
              "No production model configured. Configure GEMINI_API_KEY, XAI_API_KEY, or LLM_API_KEY and LLM_MODEL.",
            );
          },
        })
  );
}
