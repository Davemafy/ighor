import { BriefSchema } from "./contracts";

export const SupportedGoalSchema = BriefSchema.shape.kind;

export type SupportedGoal = "gathering" | "discovery" | "creative";

/** Implemented strategies only. Reference lists are alternatives, not schedules. */
const arrivalMinutes = 15;

const discussionMinutes = 25;

export const goalPolicies = {
  gathering: {
    artifactKind: "programme",
    movieOverhead: arrivalMinutes + discussionMinutes,
    arrivalMinutes,
    discussionMinutes,
    maxReferences: 2,
    programme: true,
  },
  discovery: {
    artifactKind: "comparison",
    movieOverhead: 0,
    maxReferences: 3,
    programme: false,
  },
  creative: {
    artifactKind: "creative-brief",
    movieOverhead: 0,
    maxReferences: 3,
    programme: false,
  },
} as const;
