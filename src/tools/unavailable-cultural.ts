import type { CulturalProvider } from "./interfaces";
import type { ToolResult } from "../core/contracts";

/** Configuration failure is an honest blocked observation, never fake data. */
export function unavailableCulturalProvider(reason: string): CulturalProvider {
  const blocked = <T>(data: T): ToolResult<T> => ({
    status: "blocked",
    data,
    evidenceIds: [],
    warnings: [reason],
    retry: "manual",
    requestCount: 0,
  });

  return {
    calls: 0,
    async resolve(name, type = "movie") {
      return blocked({
        id: `unresolved:${name}`,
        original: name,
        name,
        type,
        providerId: null,
        status: "unresolved" as const,
        metadata: reason,
        choices: [],
      });
    },
    async discover() {
      return blocked({ options: [], evidence: [] });
    },
    async exploreLocality() {
      return blocked({ places: [], evidence: [] });
    },
  };
}
