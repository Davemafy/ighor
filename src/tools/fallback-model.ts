import { z } from "zod";
import { ProviderHttpError } from "../core/interpretation-failure";
import type { Task } from "../core/contracts";
import type { ModelProvider } from "./interfaces";

/** Interpretation is read-only: one configured backup may repair provider failure.
 * No cultural call, write, approval or external action is replayed here. */
export class FallbackModel implements ModelProvider {
  readonly executionMode = "tool-calling" as const;
  readonly failures: {
    provider: string;
    status: number;
    category: string | null;
  }[] = [];
  constructor(
    private primary: ModelProvider,
    private backup: ModelProvider,
  ) {}
  get calls() {
    return (this.primary.calls ?? 0) + (this.backup.calls ?? 0);
  }
  get timeoutMs() {
    return (
      (this.primary.timeoutMs ?? 5000) + (this.backup.timeoutMs ?? 5000) + 1000
    );
  }
  private usingBackup = false;
  async interpret(text: string, context?: Task) {
    if (this.usingBackup) return this.backup.interpret(text, context);
    try {
      return await this.primary.interpret(text, context);
    } catch (error) {
      const recoverable =
        error instanceof z.ZodError ||
        error instanceof SyntaxError ||
        (error instanceof ProviderHttpError &&
          (error.status === 401 ||
            error.status === 402 ||
            (error.status === 400 &&
              (error.category === "credentials" ||
                error.category === "billing")) ||
            error.status === 429 ||
            error.status >= 500 ||
            ([400, 422].includes(error.status) &&
              error.schemaKeywords.length > 0))) ||
        (error instanceof Error &&
          /request failed|timed out|timeout/i.test(error.message));
      if (!recoverable) throw error;
      if (error instanceof ProviderHttpError)
        this.failures.push({
          provider: error.provider,
          status: error.status,
          category: error.category,
        });
      this.usingBackup = true;
      return this.backup.interpret(text, context);
    }
  }
  async recommend(task: Task, cultural: boolean) {
    return this.primary.recommend ? this.primary.recommend(task, cultural) : [];
  }
}
