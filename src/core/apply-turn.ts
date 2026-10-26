import { randomUUID } from "node:crypto";
import type { Task, Turn } from "./contracts";
import { ConflictError, type MemoryChange } from "../data/store";
import { freshTask } from "../data/fixtures";
import { freshLiveExample } from "../data/live-task";

export type ArtifactEdit = Extract<Turn, { type: "artifact" }>;
type StructuredTurn = Exclude<Turn, { type: "message" | "baseline" }>;
type ReadMemory = () => Task["preferences"];
interface TurnInputContext {
  taskId: string;
  owner: string;
  readMemory: ReadMemory;
}

export interface TurnUpdate {
  task: Task;
  changedDependencies: string[];
  needsDiscovery: boolean;
  localChangeOnly: boolean;
  artifactEdit?: ArtifactEdit;
  memoryChange?: MemoryChange;
  clarification: string | null;
  interpretationFailed: boolean;
  conversationOnly?: boolean;
}

export function unchangedTurn(task: Task): TurnUpdate {
  return {
    task,
    changedDependencies: [],
    needsDiscovery: false,
    localChangeOnly: false,
    clarification: null,
    interpretationFailed: false,
  };
}

export function applyStructuredTurn(
  task: Task,
  input: StructuredTurn,
  context: TurnInputContext,
): TurnUpdate {
  const update = unchangedTurn(task);

  switch (input.type) {
    case "outcome":
      changeOutcome(update, input);
      break;
    case "personal-profile":
      startPersonalDiscovery(update, input);
      break;
    case "connection":
      followCulturalConnection(update, input);
      break;
    case "place-example":
      startPlaceExample(update, input, context);
      break;
    case "sample":
      startGatheringExample(update, input, context);
      break;
    case "constraints":
      reviseConstraints(update, input);
      break;
    case "participant":
      updateParticipant(update, input);
      break;
    case "catalogue":
      replaceCatalogue(update, input);
      break;
    case "simulation":
      changeSimulation(update, input);
      break;
    case "resolve":
      chooseEntityIdentity(update, input);
      break;
    case "recall":
      recallPreference(update, input, context.readMemory);
      break;
    case "memory":
      changeSavedMemory(update, input);
      break;
    case "artifact":
      editDocument(update, input);
      break;
    case "artifact-lock":
      changeArtifactLock(update, input);
      break;
  }

  return update;
}

function changeOutcome(
  update: TurnUpdate,
  input: Extract<Turn, { type: "outcome" }>,
) {
  const { task } = update;
  const previousTarget = task.brief.targetType;
  task.brief.outcome = input.outcome;
  task.brief.kind =
    input.outcome.kind === "music-direction" ? "creative" : "discovery";
  const target =
    input.outcome.kind === "itinerary"
      ? "place"
      : input.outcome.kind === "research"
        ? task.brief.targetType
        : "artist";
  task.brief.targetType = target;
  task.brief.pinned = [];

  if (!task.brief.goal) {
    task.brief.goal = `Develop a ${input.outcome.kind} from confirmed preferences and evidence.`;
  }

  update.changedDependencies = ["outcome", "goal", "selection"];
  update.needsDiscovery = previousTarget !== target || !task.candidates.length;

  if (update.needsDiscovery) {
    update.changedDependencies.push("catalogue");
  }

  if (
    target === "place" &&
    /^(?:at home|home screening room)$/i.test(task.brief.constraints.location)
  ) {
    update.clarification =
      "Which city or locality should Igor explore? State Location: followed by its name.";
  }
}

function startPersonalDiscovery(
  update: TurnUpdate,
  input: Extract<Turn, { type: "personal-profile" }>,
) {
  const { task } = update;
  task.brief.outcome = undefined;
  task.brief.participants = [
    {
      id: "you",
      name: input.name,
      sample: false,
      preferences: [
        {
          id: randomUUID(),
          subject: "you",
          value: input.artist,
          entityType: "artist",
          polarity: "like",
          confirmed: true,
          scope: "participant",
          source: "user-supplied",
        },
        ...(input.film
          ? [
              {
                id: randomUUID(),
                subject: "you",
                value: input.film,
                entityType: "movie" as const,
                polarity: "like" as const,
                confirmed: true,
                scope: "participant" as const,
                source: "user-supplied" as const,
              },
            ]
          : []),
      ],
    },
  ];
  task.brief.kind = "discovery";
  task.brief.goal =
    "Discover films, TV and artists from my explicitly supplied tastes.";
  task.brief.targetType = undefined;
  task.brief.contextAnchor = undefined;
  task.brief.pinned = [];
  task.brief.suppliedFacts = [
    "One personal profile explicitly supplied for this task. Persistent memory requires a separate save.",
  ];
  task.brief.assumptions = [
    "No practical price, duration or availability has been verified.",
  ];
  update.changedDependencies = ["goal", "catalogue", "selection"];
  update.needsDiscovery = true;
}

function followCulturalConnection(
  update: TurnUpdate,
  input: Extract<Turn, { type: "connection" }>,
) {
  const { task } = update;
  const source = task.candidates.find(
    (candidate) =>
      candidate.id === input.candidateId &&
      candidate.providerId &&
      candidate.cultural &&
      candidate.freshness === "current",
  );

  if (!source) {
    throw new Error("Choose a current provider-returned entity.");
  }

  task.brief.contextAnchor = {
    providerId: source.providerId!,
    name: source.name,
    type: source.type,
  };
  task.brief.outcome = undefined;
  task.brief.targetType = input.targetType;
  task.brief.kind = "creative";
  task.brief.pinned = [];
  task.brief.goal = `Explore ${input.targetType} references connected to ${source.name}. These are cultural associations, not verified atmosphere, licensing or audience demand.`;
  update.changedDependencies = [
    "goal",
    "contextAnchor",
    "catalogue",
    "selection",
  ];
  update.needsDiscovery = true;
}

function startPlaceExample(
  update: TurnUpdate,
  input: Extract<Turn, { type: "place-example" }>,
  context: TurnInputContext,
) {
  const exampleTask = freshLiveExample(context.taskId, context.owner);
  exampleTask.receipts = update.task.receipts ?? [];
  exampleTask.brief.version = update.task.brief.version;
  exampleTask.brief.participants = [exampleTask.brief.participants[0]];
  exampleTask.brief.kind = "discovery";
  exampleTask.brief.targetType = "place";
  exampleTask.brief.constraints.location = input.city;
  exampleTask.brief.goal = `Explore ${input.city} through the sample Radiohead profile. Produce a cultural place shortlist; routes and current availability remain unknown.`;
  exampleTask.brief.suppliedFacts = [
    "One explicitly labelled sample profile, not the current user's inferred taste.",
  ];
  update.task = exampleTask;
  update.changedDependencies = ["goal", "catalogue", "location", "selection"];
  update.needsDiscovery = true;
}

function startGatheringExample(
  update: TurnUpdate,
  input: Extract<Turn, { type: "sample" }>,
  context: TurnInputContext,
) {
  const exampleTask =
    update.task.mode === "qloo-live"
      ? freshLiveExample(context.taskId, context.owner)
      : freshTask(context.taskId, context.owner);
  exampleTask.brief.version = update.task.brief.version;
  exampleTask.receipts = update.task.receipts ?? [];
  update.task = exampleTask;
  update.task.brief.goal =
    "Plan a three-hour evening for six friends with different film and music tastes. Our sample group budget is $60.";
  update.needsDiscovery = true;
  update.changedDependencies = ["catalogue", "selection"];

  if (input.example === "short") {
    update.task.brief.constraints.duration = 120;
  }

  if (input.example === "budget") {
    update.task.brief.constraints.budget = 25;
  }
}

function reviseConstraints(
  update: TurnUpdate,
  input: Extract<Turn, { type: "constraints" }>,
) {
  const { task } = update;

  for (const key of ["budget", "duration", "location"] as const) {
    if (
      input[key] !== undefined &&
      input[key] !== task.brief.constraints[key]
    ) {
      Object.assign(task.brief.constraints, { [key]: input[key] });
      update.changedDependencies.push(key);
    }
  }

  // Artist-only cultural work doesn't depend on the physical venue.
  // Re-evaluate practical facts and dependent output drafts, but retain
  // cultural evidence and an independently approved sound direction.
  update.needsDiscovery =
    update.changedDependencies.includes("location") &&
    (task.brief.targetType !== "artist" || task.brief.kind === "gathering");
}

function updateParticipant(
  update: TurnUpdate,
  input: Extract<Turn, { type: "participant" }>,
) {
  const { task } = update;

  if (input.reviewId) {
    if (task.reviewEffects?.includes(input.reviewId)) {
      throw new ConflictError("Review effect already applied.");
    }

    task.reviewEffects = [...(task.reviewEffects ?? []), input.reviewId].slice(
      -100,
    );
  }

  if (
    input.participant.preferences.some(
      (preference) =>
        preference.subject !== input.participant.id ||
        preference.scope === "persistent",
    )
  ) {
    throw new Error(
      "Participant preferences must have their own subject and participant/task scope.",
    );
  }

  const previousParticipant = task.brief.participants.find(
    (participant) => participant.id === input.participant.id,
  );
  input.participant.sample = input.reviewId
    ? (previousParticipant?.sample ?? false)
    : false;
  input.participant.preferences = input.participant.preferences.map(
    (preference) => {
      const previous = input.reviewId
        ? previousParticipant?.preferences.find(
            (old) =>
              old.id === preference.id &&
              old.value === preference.value &&
              old.polarity === preference.polarity &&
              old.confirmed === preference.confirmed &&
              old.entityType === preference.entityType,
          )
        : undefined;

      return previous
        ? { ...previous }
        : { ...preference, source: "user-supplied" as const };
    },
  );
  const idx = task.brief.participants.findIndex(
    (participant) => participant.id === input.participant.id,
  );

  if (idx < 0) {
    task.brief.participants.push(input.participant);
  } else {
    task.brief.participants[idx] = input.participant;
  }

  update.changedDependencies = [
    `preferences:${input.participant.id}`,
    "selection",
  ];
  update.needsDiscovery = true;
}

function replaceCatalogue(
  update: TurnUpdate,
  input: Extract<Turn, { type: "catalogue" }>,
) {
  const { task } = update;

  if (
    new Set(input.options.map((candidate) => candidate.id)).size !==
    input.options.length
  ) {
    throw new Error("Catalogue IDs must be unique.");
  }

  task.catalogue = input.options.map((candidate) => ({
    ...candidate,
    sample: false,
    cost: { ...candidate.cost, source: "user-supplied" },
    duration: { ...candidate.duration, source: "user-supplied" },
    availabilitySource: "user-supplied",
    location: candidate.location ?? task.brief.constraints.location,
  }));
  update.changedDependencies = ["catalogue"];
  update.needsDiscovery = true;
}

function changeSimulation(
  update: TurnUpdate,
  input: Extract<Turn, { type: "simulation" }>,
) {
  const { task } = update;
  task.simulation = input.mode;
  update.changedDependencies = ["catalogue"];
  update.needsDiscovery = true;
}

function chooseEntityIdentity(
  update: TurnUpdate,
  input: Extract<Turn, { type: "resolve" }>,
) {
  const { task } = update;
  const entity = task.entities.find((entity) => entity.id === input.entityId);
  const choice = entity?.choices.find((c) => c.id === input.choiceId);

  if (!entity || !choice) {
    throw new Error("Choose an offered identity.");
  }

  Object.assign(entity, {
    providerId: choice.id,
    name: choice.name,
    type: choice.type,
    status: "resolved",
    metadata: "Identity explicitly chosen by the user.",
  });
  update.changedDependencies = ["selection"];
  update.needsDiscovery = true;
}

function recallPreference(
  update: TurnUpdate,
  input: Extract<Turn, { type: "recall" }>,
  readMemory: ReadMemory,
) {
  const { task } = update;
  const preference = readMemory().find(
    (preference) => preference.id === input.preferenceId,
  );
  const participant = task.brief.participants.find(
    (participant) => participant.id === input.participantId,
  );

  if (!preference || !participant) {
    throw new Error("Saved preference or participant not found.");
  }

  participant.preferences = participant.preferences.filter(
    (p) => p.value.toLowerCase() !== preference.value.toLowerCase(),
  );
  participant.preferences.push({
    ...preference,
    id: randomUUID(),
    subject: participant.id,
    scope: "participant",
  });
  update.changedDependencies = [`preferences:${participant.id}`, "selection"];
  update.needsDiscovery = true;
}

function changeSavedMemory(
  update: TurnUpdate,
  input: Extract<Turn, { type: "memory" }>,
) {
  const { task } = update;
  const preference = task.brief.participants
    .flatMap((participant) => participant.preferences)
    .find((preference) => preference.id === input.preferenceId);

  if (!preference && input.operation === "save") {
    throw new Error("Preference not found.");
  }

  task.preferences = task.preferences.filter(
    (preference) => preference.id !== input.preferenceId,
  );

  if (input.operation === "save" && preference) {
    task.preferences.push({
      ...preference,
      scope: "persistent",
      confirmed: true,
      source: "user-supplied",
    });
  }

  update.memoryChange =
    input.operation === "save"
      ? {
          operation: "save",
          preference: structuredClone(
            task.preferences.find(
              (preference) => preference.id === input.preferenceId,
            )!,
          ),
        }
      : { operation: "delete", id: input.preferenceId };
  update.localChangeOnly = true;
}

function changeArtifactLock(
  update: TurnUpdate,
  input: Extract<Turn, { type: "artifact-lock" }>,
) {
  const artifact = update.task.artifacts.find((a) => a.id === input.artifactId);
  if (!artifact) throw new Error("Artifact not found.");
  if (input.locked && artifact.freshness !== "current") {
    throw new Error("Only current work can be approved.");
  }
  artifact.locked = input.locked;
  if (!input.locked && artifact.freshness === "stale") {
    // Unlocking an invalidated artifact requests a real recomposition;
    // merely flipping the lock cannot make old evidence current.
    update.changedDependencies.push(artifact.id);
    update.localChangeOnly = false;
  } else {
    update.localChangeOnly = true;
  }
}

function editDocument(
  update: TurnUpdate,
  input: Extract<Turn, { type: "artifact" }>,
) {
  const artifact = update.task.artifacts.find((a) => a.id === input.artifactId);
  if (!artifact) throw new Error("Artifact not found.");
  if (artifact.locked) throw new Error("Unlock approved work before editing it.");
  update.artifactEdit = input;
  update.localChangeOnly = true;
}
