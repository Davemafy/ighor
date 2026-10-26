import { z } from "zod";

/** Output requests refine an implemented goal; they do not grant tool access. */
export const OutcomeSpecSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("itinerary"),
    days: z.number().int().min(1).max(7),
    transferMinutes: z.number().int().min(0).max(240).nullable(),
  }),
  z.strictObject({
    kind: z.literal("listening"),
    transitionMinutes: z.number().int().min(0).max(30),
  }),
  z.strictObject({ kind: z.literal("research") }),
  z.strictObject({ kind: z.literal("music-direction") }),
]);

export type OutcomeSpec = z.infer<typeof OutcomeSpecSchema>;

const Reference = z.object({
  candidateId: z.string(),
  evidenceIds: z.array(z.string()).min(1),
  eligibility: z.enum(["eligible", "ineligible", "needs-review"]),
  caveats: z.array(z.string()),
});

const Segment = z.object({
  candidateId: z.string(),
  day: z.number().int().min(1).max(7),
  startMinute: z.number().nonnegative(),
  minutes: z.number().positive(),
  transferBefore: z.number().nonnegative(),
});

export const OutcomeDetailsSchema = z.object({
  kind: z.enum(["itinerary", "listening", "research", "music-direction"]),
  status: z.enum([
    "feasible-from-supplied-facts",
    "provisional",
    "references-only",
  ]),
  references: z.array(Reference).max(30),
  segments: z.array(Segment).max(30),
  days: z.number().int().min(1).max(7),
  totalCost: z.number().nonnegative(),
  totalMinutes: z.number().nonnegative(),
  openQuestions: z.array(z.string()),
  claims: z
    .array(
      z.object({
        text: z.string(),
        basis: z.enum([
          "retrieved-association",
          "supplied-fact",
          "application-interpretation",
          "limitation",
        ]),
        candidateIds: z.array(z.string()),
        evidenceIds: z.array(z.string()),
      }),
    )
    .max(100),
});

export type OutcomeDetails = z.infer<typeof OutcomeDetailsSchema>;

export class OutcomeGroundingError extends Error {
  constructor(
    message: string,
    readonly question = message,
  ) {
    super(message);
    this.name = "OutcomeGroundingError";
  }
}

/** Model-extracted allowances must be stated; omitted values use disclosed defaults. */
export function assertGroundedOutcome(
  spec: OutcomeSpec,
  text: string,
  previous?: OutcomeSpec,
) {
  if (spec.kind === "itinerary") {
    const day = /\b(\d+)\s*[- ]days?\b/i.exec(text);
    const expected = day ? Number(day[1]) : /\bweekend\b/i.test(text) ? 2 : 1;

    if (
      spec.days !== expected &&
      !(previous?.kind === "itinerary" && previous.days === spec.days)
    ) {
      throw new OutcomeGroundingError(
        "State the journey day count explicitly.",
        "How many days should I plan for?",
      );
    }

    if (
      !(
        previous?.kind === "itinerary" &&
        previous.transferMinutes === spec.transferMinutes
      ) &&
      spec.transferMinutes !== null &&
      spec.transferMinutes !== 0 &&
      !new RegExp(
        `\\btransfer(?:s| allowance)?\\s*(?:of|:)?\\s*${spec.transferMinutes}\\s*(?:minutes?|mins?)\\b`,
        "i",
      ).test(text)
    ) {
      throw new OutcomeGroundingError(
        "State the transfer allowance explicitly.",
        "How much time should I allow for travel between stops?",
      );
    }

    // Even zero is a supplied fact, never infer instantaneous travel.
    if (
      !(previous?.kind === "itinerary" && previous.transferMinutes === 0) &&
      spec.transferMinutes === 0 &&
      !/\btransfer(?:s| allowance)?\s*(?:of|:)?\s*0\s*(?:minutes?|mins?)\b/i.test(
        text,
      )
    ) {
      throw new OutcomeGroundingError(
        "Zero travel time must be explicitly supplied.",
        "Should travel time between stops stay unconfirmed?",
      );
    }
  }

  if (
    spec.kind === "listening" &&
    !(
      previous?.kind === "listening" &&
      previous.transitionMinutes === spec.transitionMinutes
    ) &&
    spec.transitionMinutes !== 0 &&
    !new RegExp(
      `\\btransition(?:s| allowance)?\\s*(?:of|:)?\\s*${spec.transitionMinutes}\\s*(?:minutes?|mins?)\\b`,
      "i",
    ).test(text)
  ) {
    throw new OutcomeGroundingError(
      "State the transition allowance explicitly.",
      "How much time would you like between listening segments?",
    );
  }
}
