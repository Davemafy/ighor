import { z } from "zod";
import type { Task } from "./contracts";

export const AgentAcceptanceSchema = z.object({
  requestedOutcome: z.string(),
  status: z.enum(["satisfied", "unknown", "blocked"]),
  checks: z.array(
    z.object({
      requirement: z.string(),
      status: z.enum(["satisfied", "unknown", "blocked"]),
      artifactIds: z.array(z.string()),
      evidenceIds: z.array(z.string()),
    }),
  ),
});

/** Conservative server checks. Satisfied means execution obligations were met,
 * never that prose, estimated budgets or external availability were verified. */
export function verifyAgentOutcome(
  task: Task,
  goal: string,
  modelFinished: boolean,
) {
  const run = task.agentRun!;
  const documents = task.artifacts.filter(
    (a) =>
      (a.id.startsWith(`agent-doc-${run.id}-`) ||
        run.outputArtifactIds?.includes(a.id)) &&
      a.freshness === "current",
  );
  const requiresDocument =
    /\b(save|draft|create|write|design|proposal|pitch|deliverable|report|plan)\b/i.test(
      goal,
    );
  const cultural = task.evidence.filter(
    (e) =>
      e.kind === "cultural" &&
      e.source === "provider-returned" &&
      e.freshness === "current",
  );
  const checks: z.infer<typeof AgentAcceptanceSchema>["checks"] = [];

  if (requiresDocument) {
    checks.push({
      requirement:
        "Requested editable work is saved in this run; content and practical estimates still require review.",
      status: documents.length ? "satisfied" : "unknown",
      artifactIds: documents.map((a) => a.id),
      evidenceIds: documents.flatMap((a) => a.evidenceIds),
    });
  }

  if (/\bqloo\b/i.test(goal)) {
    checks.push({
      requirement:
        "Requested Qloo relationships have inspectable provider evidence, beyond entity resolution.",
      status: cultural.length ? "satisfied" : "blocked",
      artifactIds: [],
      evidenceIds: cultural.map((e) => e.id),
    });
  }

  checks.push({
    requirement:
      "The agent reviewed useful observations or saved work before ending.",
    status:
      (modelFinished || documents.length > 0) &&
      (documents.length > 0 || run.sources.length > 0 || cultural.length > 0)
        ? "satisfied"
        : "unknown",
    artifactIds: documents.map((a) => a.id),
    evidenceIds: cultural.map((e) => e.id),
  });
  const status = checks.some((c) => c.status === "blocked")
    ? "blocked"
    : checks.every((c) => c.status === "satisfied")
      ? "satisfied"
      : "unknown";

  return AgentAcceptanceSchema.parse({
    requestedOutcome: goal.slice(0, 3000),
    status,
    checks,
  });
}
