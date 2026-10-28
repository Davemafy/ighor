import type { PresentationNode } from "./presentation";
import type { FormAnswerGrounding } from "./conversation";

export function groundQuestionAnswer(
  node: Extract<PresentationNode, { type: "question" }>,
  values: Record<string, string>,
): FormAnswerGrounding {
  const constraints: NonNullable<FormAnswerGrounding["constraints"]> = {};
  const ambiguous = new Set<string>();

  for (const field of node.fields) {
    const value = values[field.id]?.trim();

    if (!value) {
      continue;
    }

    const label = field.label.trim().toLocaleLowerCase();
    // Compatibility for already-saved forms. New forms declare a typed binding.
    const binding =
      field.binding ??
      (/^budget(?:\s*\((?:usd|\$)\))?\s*[:?]?$/.test(label)
        ? "budget"
        : /^duration\s*\((?:minutes?|mins?)\)\s*[:?]?$/.test(label)
          ? "duration-minutes"
          : /^duration\s*\(hours?\)\s*[:?]?$/.test(label)
            ? "duration-hours"
            : undefined);

    if (binding === "budget-per-person") {
      continue;
    }

    if (binding === "location" && value.length <= 100) {
      if (constraints.location && constraints.location !== value) {
        ambiguous.add("location");
      }

      constraints.location = value;
      continue;
    }

    if (!binding || !/^\d+(?:\.\d+)?$/.test(value)) {
      continue;
    }

    const number = Number(value) * (binding === "duration-hours" ? 60 : 1);
    const key = binding === "budget" ? "budget" : "duration";

    if (
      !Number.isFinite(number) ||
      (key === "budget"
        ? number < 0 || number > 1000000
        : !Number.isInteger(number) || number < 15 || number > 1440)
    ) {
      continue;
    }

    if (constraints[key] !== undefined && constraints[key] !== number) {
      ambiguous.add(key);
    }

    constraints[key] = number;
  }

  for (const key of ambiguous) {
    delete constraints[key as "budget" | "duration" | "location"];
  }

  return {
    subject: node.subject,
    question: `${node.title || ""} ${node.prompt}`,
    values: Object.values(values).filter(Boolean),
    constraints,
  };
}
