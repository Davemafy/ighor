import type { Task } from "./contracts";

const words: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

export function ordinalMention(text: string): number | null {
  const match = /\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:one|option|choice|pick|artist|film|movie|place)\b/i.exec(text);

  return match ? words[match[1].toLowerCase()] : null;
}

/** Build on the authoritative task at save time. Keep list order stable on
 * non-discovery turns; update the reference revision only if IDs change. */
export function updateConversationFocus(task: Task) {
  const previous = task.conversationFocus;
  const current = task.candidates
    .filter((item) => item.freshness === "current")
    .map((item) => item.id)
    .slice(0, 30);
  const candidateIds = current.length
    ? current
    : task.catalogue.map((item) => item.id).slice(0, 30);
  const priorIds = previous?.activeCandidateIds ?? [];
  const changed =
    candidateIds.length !== priorIds.length ||
    candidateIds.some((id, index) => id !== priorIds[index]);
  const activeArtifact =
    previous?.activeArtifactId &&
    task.artifacts.some((item) => item.id === previous.activeArtifactId)
      ? previous.activeArtifactId
      : task.artifacts.findLast((item) => item.freshness === "current")?.id ?? null;
  const currentQuestion = task.canvas?.surface.nodes.find(
    (node) => node.type === "question",
  )?.id ?? null;

  task.conversationFocus = {
    activeArtifactId: activeArtifact,
    activeCandidateIds: candidateIds,
    ordinalMap: Object.fromEntries(
      candidateIds.map((id, index) => [String(index + 1), id]),
    ),
    lastResultRevision: changed
      ? task.brief.version
      : previous?.lastResultRevision ?? task.brief.version,
    lastQuestionId: currentQuestion,
    referencedParticipants: task.brief.participants
      .filter((person) => !person.sample)
      .map((person) => person.id),
  };

  return task.conversationFocus;
}

export function resolveOrdinalFocus(task: Task, text: string) {
  const ordinal = ordinalMention(text);

  if (!ordinal) {
    return { kind: "none" as const };
  }

  const focused = task.conversationFocus;
  const id = focused?.ordinalMap[String(ordinal)];
  const item = task.candidates.find(
    (candidate) => candidate.id === id && candidate.freshness === "current",
  ) ?? task.catalogue.find((candidate) => candidate.id === id);

  if (!item || !focused || !focused.activeCandidateIds.includes(item.id)) {
    return { kind: "ambiguous" as const, ordinal };
  }

  return {
    kind: "resolved" as const,
    ordinal,
    candidateId: item.id,
    name: item.name,
    resultRevision: focused.lastResultRevision,
  };
}
