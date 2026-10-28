import type { Task } from "@/core/contracts";

/** Presentation only: never changes routing, taste or tool execution. */
export function loadingFormat(
  input: string,
  task?: Task | null,
): "sleeves" | "postcards" {
  const explicit = (text: string) => {
    if (
      /\b(?:films?|movies?|cinema|watch|albums?|records?|music|playlist)\b/i.test(
        text,
      )
    ) {
      return "sleeves" as const;
    }

    if (
      /\b(?:trip|travel|places?|getaway|itinerary|outing|caf[eé]s?|restaurants?|get-together|dining|venues?)\b/i.test(
        text,
      )
    ) {
      return "postcards" as const;
    }

    return undefined;
  };

  const current = explicit(input);

  if (current) {
    return current;
  }

  // Resolve short follow-ups from user intent rather than provider/error prose.
  const recent = task?.messages
    .filter((message) => message.role === "user")
    .slice(-4)
    .reverse();

  for (const message of recent ?? []) {
    const format = explicit(message.text);

    if (format) {
      return format;
    }
  }

  return task?.brief.targetType === "movie" ||
    task?.brief.targetType === "artist" ||
    task?.brief.targetType === "tv_show"
    ? "sleeves"
    : "postcards";
}
