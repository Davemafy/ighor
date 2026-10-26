import type { Task } from "../core/contracts";

const historyBudget = 64000;
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

/** Each model call is rebuilt from this thread, never from provider-side session state. */
export function modelContext(task: Task, message: string) {
  const messages = task.messages.map(({ role, text, at }, index) => ({
    index,
    role,
    text,
    at,
  }));
  let history = messages;

  if (bytes(messages) > historyBudget) {
    const terms = new Set(
      message.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [],
    );
    const score = (text: string) =>
      [...terms].filter((term) => text.toLowerCase().includes(term)).length;
    const recent = messages.slice(-20).reverse();
    const earlier = messages
      .slice(0, -20)
      .sort((left, right) => score(right.text) - score(left.text));
    const selected = new Map<number, (typeof messages)[number]>();
    let used = 0;

    for (const entry of [...recent, ...earlier]) {
      const size = bytes(entry);

      const limit =
        entry.index >= messages.length - 20
          ? historyBudget * 0.75
          : historyBudget;

      if (used + size <= limit) {
        selected.set(entry.index, entry);
        used += size;
      }
    }

    history = [...selected.values()].sort(
      (left, right) => left.index - right.index,
    );
  }

  return {
    thread: {
      messages: history,
      totalMessages: messages.length,
      omittedMessages: messages.length - history.length,
    },
    work: task.work
      ? {
          activeGoalId: task.work.activeGoalId,
          goals: task.work.goals,
          budget: task.work.budget,
          decisions: task.work.decisions.map((d) => ({
            id: d.id,
            goalId: d.goalId,
            title: d.title,
            value: d.value.slice(0, 500),
            rationale: d.rationale.slice(0, 300),
            status: d.status,
            estimatedCost: d.estimatedCost,
            conflict: d.conflict?.slice(0, 500),
            dependencies: d.dependencies,
            evidenceIds: d.evidenceIds,
            version: d.version,
          })),
          documents: task.work.documents.map((d) => ({
            id: d.id,
            goalId: d.goalId,
            title: d.title,
            content: d.content.slice(
              0,
              d.goalId === task.work?.activeGoalId ? 1200 : 120,
            ),
            status: d.status,
            edited: d.edited,
            freshness: d.freshness,
            conflict: d.conflict?.slice(0, 500),
            dependencies: d.dependencies,
            evidenceIds: d.evidenceIds,
            version: d.version,
          })),
          latestChange: task.work.changes.at(-1),
          externalActions: task.work.externalActions.slice(-5),
        }
      : undefined,
    goal: task.brief.goal,
    kind: task.brief.kind,
    targetType: task.brief.targetType,
    outcome: task.brief.outcome,
    constraints: task.brief.constraints,
    participants: task.brief.participants,
    selected: task.brief.selected,
    unresolved: task.brief.unresolved,
    assumptions: task.brief.assumptions,
    status: task.status,
    error: task.error,
    candidates: task.candidates.length
      ? task.candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          type: candidate.type,
          cost: candidate.cost,
          duration: candidate.duration,
          available: candidate.available,
          availabilitySource: candidate.availabilitySource,
          eligibility: candidate.eligibility,
          missing: candidate.missing,
          fitReason: candidate.fitReason,
          evidenceIds: candidate.evidenceIds,
          freshness: candidate.freshness,
        }))
      : task.catalogue.map(({ id, name, type }) => ({ id, name, type })),
    entities: task.entities,
    evidence: task.evidence.slice(-80).map((evidence) => ({
      id: evidence.id,
      source: evidence.source,
      delivery: evidence.delivery,
      at: evidence.at,
      entityIds: evidence.entityIds,
      summary: evidence.summary.slice(0, 1000),
      limitations: evidence.limitations,
      freshness: evidence.freshness,
    })),
    artifacts: task.artifacts.map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      content: artifact.content.slice(0, 3000),
      freshness: artifact.freshness,
      evidenceIds: artifact.evidenceIds,
      assumptions: artifact.assumptions,
      openQuestions: artifact.details?.openQuestions,
    })),
  };
}
