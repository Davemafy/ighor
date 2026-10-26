import type { Task } from "../core/contracts";

/** Credential-free examples for the development model. Live turns use model decisions. */
export function developmentReply(text: string, task?: Task): string | null {
  const message = text
    .normalize("NFKC")
    .trim()
    .replace(/[.!?…]+$/u, "")
    .trim();

  if (
    /^(?:(?:hey|hi|hello|hiya|howdy|yo)(?:[, ]+(?:igor|there))?|good (?:morning|afternoon|evening)(?:[, ]+igor)?)$/i.test(
      message,
    )
  ) {
    return task?.brief.goal
      ? "Hey! What would you like to change or explore next?"
      : "Hey! I’m Igor. Tell me what you’re into or what you have in mind. We can discover something new, shape a plan, or work through an idea together.";
  }

  if (
    /^(?:what can you do|how can you help(?: me)?|who are you|what is igor|help)$/i.test(
      message,
    )
  ) {
    return "I’m Igor, your agent with taste. Tell me what you want to do and a little about what you like. I can connect films, music and places, shape plans and creative briefs, compare ideas, and help people with different tastes find common ground. I’ll show what supports a result and what still needs checking.";
  }

  if (
    /^(?:thanks|thank you|thanks igor|thank you igor|cheers)$/i.test(message)
  ) {
    return "You’re welcome. We can keep refining this or explore something new whenever you’re ready.";
  }

  return null;
}
