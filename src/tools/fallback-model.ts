import { z } from "zod";
import { ProviderHttpError } from "../core/interpretation-failure";
import type { Task } from "../core/contracts";
import type { ModelProvider } from "./interfaces";

/** Interpretation is read-only: one configured backup may repair provider failure.
 * No cultural call, write, approval or external action is replayed here. */
export class FallbackModel implements ModelProvider {
  readonly executionMode = "tool-calling" as const;
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
  async interpret(text: string, context?: Task) {
    try {
      return await this.primary.interpret(text, context);
    } catch (error) {
      const recoverable =
        error instanceof z.ZodError ||
        error instanceof SyntaxError ||
        (error instanceof ProviderHttpError &&
          (error.status === 429 || error.status >= 500 || ([400, 422].includes(error.status) && error.schemaKeywords.length > 0))) ||
        (error instanceof Error &&
          /request failed|timed out|timeout/i.test(error.message));
      if (!recoverable) throw error;
      return this.backup.interpret(text, context);
    }
  }
  async recommend(task: Task, cultural: boolean) {
    return this.primary.recommend ? this.primary.recommend(task, cultural) : [];
  }
}
