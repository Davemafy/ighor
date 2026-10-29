/** Query-qualified map keys retain independent context signals. Evidence keeps
 * its original provider-adapter identity; qualification must not invent IDs. */
export function culturalEvidenceId(
  candidate: { id: string; providerId: string | null },
  scope: string,
  signal: { queryId: string; signalScope?: "context" | "participant" },
) {
  const originalScope =
    signal.signalScope === "context" && scope === `context:${signal.queryId}`
      ? "context"
      : scope;

  return `qloo:${signal.queryId}:${originalScope}:${candidate.providerId ?? candidate.id}`;
}
