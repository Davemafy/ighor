import { LiveDecisionSchema, type Task } from "../core/contracts";

export function delegatedMoviePick(text: string, context?: Task) {
  const permission =
    /\b(?:pick|choose|select)\s+(?:one\s+)?for me\b|\bsurprise me\b|\brandom(?:ly)?\s+(?:pick|movies?|films?)\b|\bany (?:movies?|films?)\b/i.test(
      text,
    );
  const movieContext =
    /\b(?:movies?|films?|cinema)\b/i.test(text) ||
    Boolean(
      context?.messages.some(
        (message) =>
          message.role === "user" &&
          /\b(?:movies?|films?|cinema)\b/i.test(message.text),
      ),
    );

  return permission && movieContext;
}

/** App-owned capability boundaries and views over already retrieved images. */
export function interfaceReply(text: string, context?: Task) {
  if (delegatedMoviePick(text, context)) {
    return LiveDecisionSchema.parse({
      intent: "goal",
      kind: "discovery",
      goal: "Explore movie recommendations using an Igor-chosen cultural starting point, not an inferred personal preference.",
      targetType: "movie",
    });
  }

  if (
    /\b(?:ui|interface|chat|workspace|theme)\b/i.test(text) &&
    /\b(?:fluid|water[ -]?like|morphing|ripples?|water physics)\b/i.test(
      text,
    ) &&
    !/\b(?:write|document|article|explain|describe|design brief)\b/i.test(text)
  ) {
    return LiveDecisionSchema.parse({
      intent: "conversation",
      reply:
        "Fluid UI means the interface smoothly changes shape as real work appears. A message cannot install water effects or redesign this chat. A ‘Fluid Workspace’ writeup is only text, not a working interface change. Appearance controls the available colours and motion.",
    });
  }

  if (
    /^(?:(?:show|bring|display)(?: me)?\s+)?(?:(?:their|the|those)\s+)?(?:images|posters|pictures)(?:\s+(?:please|of (?:them|those films|these movies)))?[.!?]*$/i.test(
      text.trim(),
    )
  ) {
    const candidates =
      context?.candidates.filter(
        (candidate) => candidate.freshness === "current" && candidate.imageUrl,
      ) ?? [];

    if (candidates.length) {
      return LiveDecisionSchema.parse({
        intent: "conversation",
        reply: "Here are the available images for the retrieved references.",
        presentation: {
          id: "reference-images",
          title: "Your references",
          basis: "retrieved-evidence",
          root: "images",
          nodes: [
            {
              id: "images",
              type: "discovery",
              candidateIds: candidates
                .slice(0, 12)
                .map((candidate) => candidate.id),
            },
          ],
        },
      });
    }

    // Preserve the requested content and avoid pretending the provider returned
    // artwork for model-only prose suggestions. No invented image URLs.
    return LiveDecisionSchema.parse({
      intent: "conversation",
      reply:
        "Those titles were text suggestions; no verified poster images are attached to them. I haven’t displayed images for that list.",
    });
  }
}
