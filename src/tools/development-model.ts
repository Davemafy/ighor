import type { ModelProvider } from "./interfaces";
import type { Task, ModelInterpretation } from "../core/contracts";
import { ConversationActionSchema } from "../core/contracts";
import { z } from "zod";

export class DevelopmentModel implements ModelProvider {
  readonly executionMode = "scripted" as const;
  async interpret(
    text: string,
    context?: Task,
  ): ReturnType<ModelProvider["interpret"]> {
    for (const parse of correctionParsers) {
      const correction = parse(text, context);

      if (correction) {
        return correction;
      }
    }

    return parseGoal(text, context);
  }
}

function revision(
  text: string,
  context: Task | undefined,
  actions: z.infer<typeof ConversationActionSchema>[],
): ModelInterpretation {
  return {
    supported: true,
    intent: "revision" as const,
    kind: context?.brief.kind ?? ("gathering" as const),
    goal: text,
    actions,
  };
}

function parseSelectionReset(
  text: string,
  context?: Task,
): ModelInterpretation | undefined {
  if (
    /^(?:let igor choose|clear (?:the )?(?:pinned )?selection)\.?$/i.test(
      text.trim(),
    )
  ) {
    return revision(text, context, [{ kind: "select", candidates: [] }]);
  }
}

function parsePersonalPreference(
  text: string,
  context?: Task,
): ModelInterpretation | undefined {
  const own =
    /^I (like|dislike|am not interested in|am unsure about) (.+?)\.?$/i.exec(
      text.trim(),
    );

  if (
    own &&
    context?.brief.participants.some((participant) => participant.id === "you")
  ) {
    return revision(text, context, [
      {
        kind: "preference",
        participant: "you",
        value: own[2],
        polarity:
          own[1].toLowerCase() === "like"
            ? "like"
            : own[1].toLowerCase() === "dislike"
              ? "dislike"
              : /unsure/i.test(own[1])
                ? "unknown"
                : "not-now",
      },
    ]);
  }
}

function parseTransitionAllowance(
  text: string,
  context?: Task,
): ModelInterpretation | undefined {
  const allowance =
    /^(?:transfer|transition)(?: allowance)?\s*:\s*(\d+)\s*(?:minutes?|mins?)\.?$/i.exec(
      text.trim(),
    );

  if (
    allowance &&
    context?.brief.outcome &&
    ["itinerary", "listening"].includes(context.brief.outcome.kind)
  ) {
    const spec = context.brief.outcome;

    return {
      supported: true,
      intent: "revision",
      kind: context.brief.kind,
      goal: context.brief.goal,
      targetType: context.brief.targetType,
      outcome:
        spec.kind === "itinerary"
          ? { ...spec, transferMinutes: Number(allowance[1]) }
          : { kind: "listening", transitionMinutes: Number(allowance[1]) },
    };
  }
}

function parsePreferenceReplacement(
  text: string,
  context?: Task,
): ModelInterpretation | undefined {
  const replacement = /^replace\s+(.+?)[’']s\s+(.+?)\s+with\s+(.+?)\.?$/i.exec(
    text.trim(),
  );

  if (replacement) {
    return revision(text, context, [
      {
        kind: "preference",
        participant: replacement[1],
        value: replacement[2],
        polarity: "unknown",
      },
      {
        kind: "preference",
        participant: replacement[1],
        value: replacement[3],
        polarity: "like",
      },
    ]);
  }
}

function parseParticipantPreference(
  text: string,
  context?: Task,
): ModelInterpretation | undefined {
  const preference =
    /^(.+?)\s+(now likes|likes|dislikes|no longer likes|is not interested in|is unsure about)\s+(.+?)\.?$/i.exec(
      text.trim(),
    );

  if (preference) {
    return revision(text, context, [
      {
        kind: "preference",
        participant: preference[1],
        value: preference[3],
        polarity: /dislikes/i.test(preference[2])
          ? "dislike"
          : /no longer|unsure/i.test(preference[2])
            ? "unknown"
            : /not interested/i.test(preference[2])
              ? "not-now"
              : "like",
      },
    ]);
  }
}

function parseIdentityChoice(
  text: string,
  context?: Task,
): ModelInterpretation | undefined {
  const identity = /^use\s+(.+?)\s+from\s+((?:19|20)\d{2})\.?$/i.exec(
    text.trim(),
  );

  if (identity) {
    return revision(text, context, [
      { kind: "resolve", entity: identity[1], choice: identity[2] },
    ]);
  }
}

function parseLocationCorrection(
  text: string,
  context?: Task,
): ModelInterpretation | undefined {
  const location =
    /^(?:move (?:it|the gathering) to|location:)\s*(.+?)\.?$/i.exec(
      text.trim(),
    );

  if (location) {
    return revision(text, context, [
      { kind: "constraints", location: location[1] },
    ]);
  }
}

function parsePinnedChoice(
  text: string,
  context?: Task,
): ModelInterpretation | undefined {
  const selection = /^choose\s+(.+?)\.?$/i.exec(text.trim());

  if (selection) {
    return revision(text, context, [
      {
        kind: "select",
        candidates: selection[1].split(/\s+and\s+|\s*;\s*/i),
      },
    ]);
  }
}

function parseDocumentEdit(
  text: string,
  context?: Task,
): ModelInterpretation | undefined {
  const document = /^edit (main|invitation):\s*([\s\S]+)/i.exec(text.trim());

  if (document) {
    return revision(text, context, [
      {
        kind: "artifact",
        artifactId: document[1].toLowerCase() as "main" | "invitation",
        content: document[2],
      },
    ]);
  }
}

function parsePracticalFacts(
  text: string,
  context?: Task,
): ModelInterpretation | undefined {
  const facts = /^for\s+(.+?):\s*(.+)$/i.exec(text.trim());

  if (facts) {
    const cost = /cost\s*\$?\s*(\d+(?:\.\d+)?)/i.exec(facts[2]);
    const duration = /duration\s*(\d+)\s*(?:minutes?|mins?)/i.exec(facts[2]);
    const available = /access\s+(confirmed|unavailable|unknown)/i.exec(
      facts[2],
    );

    if (cost || duration || available) {
      return revision(text, context, [
        {
          kind: "facts",
          candidate: facts[1],
          ...(cost ? { cost: Number(cost[1]) } : {}),
          ...(duration ? { duration: Number(duration[1]) } : {}),
          ...(available
            ? {
                available: /unknown/i.test(available[1])
                  ? null
                  : /confirmed/i.test(available[1]),
              }
            : {}),
        },
      ]);
    }
  }
}

function parseGoal(text: string, context?: Task): ModelInterpretation {
  const budget =
    /(?:budget(?:\s+(?:is|to|of))?\s*[:=]?\s*\$?|\$)\s*(\d+(?:\.\d+)?)/i.exec(
      text,
    );
  const hours = /(\d+(?:\.\d+)?)\s*hours?/i.exec(text);
  const minutes = /(\d+)\s*(?:minutes?|mins?)/i.exec(
    text.replace(
      /(?:transfer|transition)(?:s| allowance)?\s*(?:of|:)?\s*\d+\s*(?:minutes?|mins?)/gi,
      "",
    ),
  );
  const wording = /^(?:invitation|wording|draft)\s*:\s*([\s\S]+)/i.exec(text);
  const itinerary = /\b(?:itinerary|multi-day|weekend|\d+-day trip)\b/i.test(
    text,
  );
  const listening =
    /\b(?:playlist|listening programme|listening program)\b/i.test(text);
  const research =
    /\b(?:research (?:brief|report)|cultural report|evidence brief)\b/i.test(
      text,
    );
  const direction =
    /\b(?:music direction|restaurant.{0,40}music|music.{0,40}restaurant)\b/i.test(
      text,
    );
  const days = /(?:for\s+)?(\d+)\s*[- ]days?/i.exec(text);
  const transfers =
    /transfer(?:s| allowance)?\s*(?:of|:)??\s*(\d+)\s*(?:minutes?|mins?)/i.exec(
      text,
    );
  const transitions =
    /transition(?:s| allowance)?\s*(?:of|:)??\s*(\d+)\s*(?:minutes?|mins?)/i.exec(
      text,
    );
  const outcome = itinerary
    ? {
        kind: "itinerary" as const,
        days: days ? Number(days[1]) : /weekend/i.test(text) ? 2 : 1,
        transferMinutes: transfers ? Number(transfers[1]) : null,
      }
    : listening
      ? {
          kind: "listening" as const,
          transitionMinutes: transitions ? Number(transitions[1]) : 0,
        }
      : research
        ? { kind: "research" as const }
        : direction
          ? { kind: "music-direction" as const }
          : undefined;
  const places =
    itinerary ||
    /\b(?:places|venues|city guide|visiting|travel|trip|itinerary)\b/i.test(
      text,
    );
  const city = places
    ? /\b(?:in|visiting)\s+([^,.;!?]+?)(?=\s+(?:for|with|budget|and|that|based)|[,.;!?]|$)/i
        .exec(text)?.[1]
        ?.trim()
    : undefined;
  const creative = /creative (?:brief|direction)|reference brief/i.test(text);
  const discovery =
    /\b(?:discover|recommend|explore|find)\b.*\b(?:films?|movies?|books?|music|artists?|cultural|references?)\b/i.test(
      text,
    );
  const gathering =
    /gather|evening|friends?|party|film night|listening (?:club|session)/i.test(
      text,
    );

  return {
    intent:
      creative || discovery || gathering || places || outcome
        ? ("goal" as const)
        : budget || hours || minutes || wording
          ? ("revision" as const)
          : ("unsupported" as const),
    supported: Boolean(
      outcome ||
      creative ||
      places ||
      discovery ||
      gathering ||
      budget ||
      hours ||
      minutes ||
      wording,
    ),
    ...(outcome ? { outcome } : {}),
    ...(research && context?.brief.targetType
      ? { targetType: context.brief.targetType }
      : {}),
    ...(listening || direction ? { targetType: "artist" as const } : {}),
    ...(places
      ? {
          targetType: "place" as const,
          ...(city
            ? { actions: [{ kind: "constraints" as const, location: city }] }
            : {}),
        }
      : {}),
    kind: places
      ? ("discovery" as const)
      : creative || direction
        ? ("creative" as const)
        : research || listening || (discovery && !gathering)
          ? ("discovery" as const)
          : ("gathering" as const),
    budget: budget ? Number(budget[1]) : undefined,
    duration: hours
      ? Math.round(Number(hours[1]) * 60)
      : minutes
        ? Number(minutes[1])
        : undefined,
    wording: wording?.[1],
    goal: text,
  };
}

// Specific corrections take precedence over broad goal words.
const correctionParsers = [
  parseSelectionReset,
  parsePersonalPreference,
  parseTransitionAllowance,
  parsePreferenceReplacement,
  parseParticipantPreference,
  parseIdentityChoice,
  parseLocationCorrection,
  parsePinnedChoice,
  parseDocumentEdit,
  parsePracticalFacts,
];
