import type { Candidate, TaskBrief } from "../core/contracts";
import type { OutcomeDetails } from "../core/outcome-spec";

/** Render the calculated result; this layer cannot select options or upgrade facts. */
export function renderOutcomeDocument(
  title: string,
  details: OutcomeDetails,
  references: Candidate[],
  brief: TaskBrief,
): string {
  const byId = new Map(
    references.map((candidate) => [candidate.id, candidate]),
  );
  const programme = details.segments
    .map((segment) => {
      const candidate = byId.get(segment.candidateId);

      if (!candidate) {
        throw new Error("Scheduled option is missing from references");
      }

      const transition = segment.transferBefore
        ? ` · ${segment.transferBefore} minutes supplied transition before`
        : "";

      return `Day ${segment.day} · minute ${segment.startMinute} · ${candidate.name} · ${segment.minutes} minutes${transition}`;
    })
    .join("\n");
  const referenceText = references
    .map((candidate, index) => {
      const caveats = [...candidate.missing, ...candidate.violations].join(
        "; ",
      );

      return [
        `${index + 1}. ${candidate.name}: ${candidate.eligibility}`,
        candidate.description,
        caveats || "Practical facts supplied; not externally verified.",
        `Evidence: ${candidate.evidenceIds.join(", ")}`,
      ].join("\n");
    })
    .join("\n\n");
  const context = brief.contextAnchor
    ? `Context anchor: ${brief.contextAnchor.name}. Context association is not personal affinity.`
    : "";

  return [
    title,
    details.status.replaceAll("-", " "),
    programme ||
      "No confirmed schedule. References below are for consideration.",
    `${details.totalMinutes} of ${brief.constraints.duration} minutes · $${details.totalCost} of $${brief.constraints.budget} supplied total budget`,
    referenceText,
    context,
    `Open questions\n${details.openQuestions.map((question) => `• ${question}`).join("\n")}`,
    "No external research, bookings, live prices or track catalogue were consulted. Provider delivery and recording time remain attached to each evidence record.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
