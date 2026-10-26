import type { Candidate, Task } from "./contracts";

/** Describe committed engine state, without asking a model to invent a result. */
export function turnReply(task: Task, localChangeOnly = false): string {
  if (task.error) {
    return task.error;
  }

  if (task.status === "clarification") {
    return task.brief.unresolved.join(" ");
  }

  if (localChangeOnly) {
    return "Your edit is saved. Discovery was preserved.";
  }

  const currentArtifacts = task.artifacts.filter(
    (artifact) => artifact.freshness === "current",
  );
  const selected = task.brief.selected
    .map((id) => task.candidates.find((candidate) => candidate.id === id))
    .filter(
      (candidate): candidate is Candidate =>
        candidate !== undefined && candidate.freshness === "current",
    );
  const references = task.candidates
    .filter((candidate) => candidate.freshness === "current")
    .slice(0, 3);
  const options = selected.length ? selected : references;
  const parts: string[] = [];

  if (options.length) {
    parts.push(
      `${selected.length ? "Selected" : "Found references including"} ${options.map((candidate) => candidate.name).join(", ")}.`,
    );
  } else {
    parts.push("No current options are available yet.");
  }

  if (currentArtifacts.length) {
    parts.push(
      `${currentArtifacts.map((artifact) => artifact.title).join(", ")} ${currentArtifacts.length === 1 ? "is" : "are"} ready to inspect and refine.`,
    );
  }

  const currentEvidence = task.evidence.filter(
    (evidence) => evidence.freshness === "current",
  );

  if (
    currentEvidence.some((evidence) => evidence.source === "provider-returned")
  ) {
    const live = currentEvidence.some(
      (evidence) =>
        evidence.source === "provider-returned" && evidence.delivery === "LIVE",
    );
    const cachedOnly = currentEvidence
      .filter((evidence) => evidence.source === "provider-returned")
      .every((evidence) => evidence.delivery === "CACHED");
    parts.push(
      cachedOnly
        ? "The cultural evidence comes from cached Qloo responses."
        : live
          ? "The cultural evidence includes live Qloo responses."
          : "The cultural evidence comes from Qloo responses; their delivery mode was not recorded.",
    );
  } else if (
    currentEvidence.some((evidence) => evidence.source === "recorded-fixture")
  ) {
    parts.push(
      "The cultural evidence comes from recorded responses, not a live request.",
    );
  } else if (task.mode === "illustrative-fixtures") {
    parts.push("These cultural results and sample costs are illustrative.");
  }

  const questions = [
    ...new Set(
      currentArtifacts.flatMap(
        (artifact) => artifact.details?.openQuestions ?? [],
      ),
    ),
  ];
  const unknowns = [
    ...new Set(options.flatMap((candidate) => candidate.missing)),
  ];

  if (questions.length) {
    parts.push(`Still needed: ${questions.slice(0, 3).join(" ")}`);
  } else if (unknowns.length) {
    parts.push(`Before committing, confirm: ${unknowns.join(", ")}.`);
  }

  return parts.join(" ");
}
