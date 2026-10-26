import type { CandidateInput } from "./contracts";

/** Provider identity stays intact; supplied catalogue items have a local identity. */
export function candidateIdentity(
  c: Pick<CandidateInput, "id" | "type" | "providerId">,
): string {
  return c.providerId ?? `catalogue:${c.type}:${c.id}`;
}
