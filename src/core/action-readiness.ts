import type { Task } from "./contracts";

/**
 * A thread already in a practical-planning workflow must not stall in
 * conversation/clarification loops once the user has provided enough to
 * start *read-only* real-world research. No booking, purchase, navigation
 * or other consequential action is authorized by this heuristic.
 *
 * The model still owns Qloo/creative work delegation; this gate is strictly
 * for source-backed practical discovery, not a taste-graph guess.
 */
export function practicalDiscoveryOpportunity(task: Task, latest: string) {
  // Keep enough history for an intake-heavy thread whose initial goal was
  // never written into task.brief (the previous chatbot failure mode).
  // An active outing can still be resolved after many "yes/okay" exchanges.
  const recent = task.messages.slice(-80);
  if (
    recent.at(-1)?.role !== "user" ||
    recent.at(-1)?.text !== latest
  ) return null;
  const user = recent.filter((m) => m.role === "user");
  const assistant = recent.filter((m) => m.role === "assistant");
  const prior = user.slice(0, -1);
  const joined = user.map((m) => m.text).join(" ");
  const previous = prior.map((m) => m.text).join(" ");

  const planning =
    /\b(?:plan|find|look for|suggest|recommend|explore|discover|book|organize|arrange|outing|weekend trip|things to do|places to go)\b/i.test(
      joined,
    );
  const practical =
    /\b(?:friends?|group|venues?|cafes?|restaurants?|dining|dinner|brunch|lunch|activities|hangout|date night|outing|trip|places|go out|games?)\b/i.test(
      joined,
    );
  if (!planning || !practical || !assistant.length) return null;

  const explicitGo =
    /^(?:(?:okay|ok|yes|yeah|yep)[ ,.!]*)?(?:go(?: ahead)?|do it|show me|where|former|latter|find (?:them|some|places|options)|give me (?:some|options)|look (?:them|it) up|stop asking|too many questions|just (?:do it|show me|find them))\s*[.!?]*$/i.test(
      latest.trim(),
    ) ||
    /^(?:okay\s+|ok\s+)?go\s*[!.,]?\s*(?:too many questions|stop asking(?: me questions)?)\s*[.!?]*$/i.test(
      latest.trim(),
    );
  // The prior assistant's actual question, not an English-only list of
  // hobbies, establishes that the short answer contains interests. For
  // example "dinning, monopoly", "anime", "pickleball", or "coffee & jazz".
  const previousAssistant = [...recent]
    .slice(0, -1)
    .reverse()
    .find((message) => message.role === "assistant");
  const recentUserAnswer =
    latest.trim().length >= 3 &&
    latest.trim().length < 140 &&
    !/^(?:yes|no|okay|ok|go|former|latter|sure|fine|yep|yeah)$/i.test(
      latest.trim(),
    ) &&
    !!previousAssistant &&
    /\b(?:activities|interests|in the mood|kind of|vibe|enjoy|prefer|like to do)\b/i.test(
      previousAssistant.text,
    );
  // Locate an explicit city answer after Igor asked where. Never invent or
  // silently adopt a default city from the saved brief.
  let city = "";
  for (let i = recent.length - 1; i > 0; i--) {
    const message = recent[i];
    const preceding = recent[i - 1];
    if (
      message.role === "user" &&
      preceding.role === "assistant" &&
      /\b(?:which city|where are|where.*located|what (?:city|area|borough)|your location)\b/i.test(preceding.text) &&
      /^(?!yes$|no$|okay$|go$)[\p{L}\p{M}][\p{L}\p{M}\s,.'-]{1,70}$/iu.test(message.text.trim())
    ) {
      city = message.text.trim();
      break;
    }
  }
  // A city supplied directly in the same actionable request also counts.
  const directCity = user.find((m) =>
    /\b(?:in|near|around|at)\s+[\p{Lu}][\p{L}\s]{2,35}/u.test(m.text) &&
    /\b(?:plan|find|outing|trip|places)\b/i.test(m.text),
  );
  if (!city && directCity) {
    city =
      /\b(?:in|near|around|at)\s+([\p{Lu}][\p{L}\s]{2,35})/u.exec(
        directCity.text,
      )?.[1]?.trim() ?? "";
  }
  if (!city) return null;

  const interests = recent
    .flatMap((message, i) => {
      if (message.role !== "user" || i === 0) return [];
      const previousMessage = recent[i - 1];
      if (
        previousMessage.role === "assistant" &&
        /\b(?:activities|interests|in the mood|kind of|vibe|enjoy|prefer|like to do)\b/i.test(
          previousMessage.text,
        ) &&
        message.text.trim().length < 140
      ) {
        return [message.text.trim()];
      }
      return [];
    })
    .slice(-2);
  if (!interests.length) return null;

  // An unambiguous go/show instruction completes the handoff. An ordinary
  // interest answer also starts discovery when both city and plan are known.
  if (!explicitGo && !(recentUserAnswer && /\b(?:plan|find|outing|trip)\b/i.test(previous))) {
    return null;
  }

  const constraints = user
    .filter((m) =>
      /(?:\$|\b(?:budget|per person|people|friends|saturday|sunday|tomorrow|tonight|this weekend)\b|\b\d+\s*(?:people|friends|guests))/.test(
        m.text.toLowerCase(),
      ),
    )
    .map((m) => m.text.trim().slice(0, 90))
    .slice(-2);

  const query = [
    `real venues options in ${city}`,
    interests.join("; "),
    constraints.join("; "),
    "official website hours prices booking group seating",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
  return { query, city, mode: "practical" as const };
}
