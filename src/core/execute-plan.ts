import { delegatedMoviePick } from "../tools/interface-replies";
import { mergeArtifacts } from "./preserve-artifacts";
import type { Task } from "./contracts";
import type { ArtifactEdit, TurnUpdate } from "./apply-turn";
import { planCapabilities } from "./capability-plan";
import { isEvidenceKind, replaceEvidence } from "./evidence";
import { candidateIdentity } from "./identity";
import { capabilities, executeCapability } from "../capabilities/registry";
import type {
  CapabilityContext,
  CapabilityResult,
} from "../capabilities/contract";

export async function executeTaskPlan(
  task: Task,
  update: TurnUpdate,
  context: CapabilityContext,
  editedArtifactWasCurrent: boolean,
): Promise<Task> {
  const { trace } = context;
  const { clarification, localChangeOnly, needsDiscovery, artifactEdit } =
    update;

  try {
    if (clarification || !task.brief.goal) {
      task.status = "clarification";
      task.brief.unresolved = [
        clarification ?? "What would you like to accomplish?",
      ];

      return task;
    }

    // A supported turn replaces the old question; identity resolution may ask another.
    if (!localChangeOnly) {
      task.brief.unresolved = [];
    }

    const latestUser =
      task.messages.filter((message) => message.role === "user").at(-1)?.text ||
      "";

    if (
      task.mode === "qloo-live" &&
      !localChangeOnly &&
      !task.brief.contextAnchor &&
      delegatedMoviePick(latestUser, task)
    ) {
      // Permission to explore is not permission to invent a personal taste.
      // Resolve this app-selected starting point through Qloo before using it.
      const seed = "Arrival";
      const resolution = await executeCapability(
        capabilities.discover,
        {
          operation: "resolve",
          terms: [seed],
          entities: task.entities,
          intendedTypes: { [seed]: "movie" },
        },
        context,
      );
      const resolved = requireCapabilityData(resolution);
      task.entities = resolved.entities;
      const anchor = resolved.entities.find(
        (entity) =>
          entity.original === seed &&
          entity.type === "movie" &&
          entity.status === "resolved" &&
          entity.providerId,
      );

      if (resolution.status !== "ok" || !anchor?.providerId) {
        task.status = "partial";
        task.brief.unresolved = [
          "Igor could not verify its exploration seed with Qloo. Retry discovery; no recommendations were invented.",
        ];

        return task;
      }

      task.brief.contextAnchor = {
        providerId: anchor.providerId,
        name: anchor.name,
        type: anchor.type,
      };
      task.brief.targetType = "movie";
      task.messages.push({
        role: "assistant",
        kind: "conversation",
        text: `I chose ${anchor.name} as an exploration starting point because you asked me to pick. This is not a preference you supplied.`,
        at: context.now(),
      });
      task.brief.assumptions = [
        ...task.brief.assumptions,
        `Igor chose ${anchor.name} as an exploration seed because you asked it to pick. This is not your stated preference.`,
      ];
      trace(
        "discovery.exploration-seed",
        `Igor-selected exploration seed: ${anchor.name}. Not a user taste claim.`,
      );
    }

    const hasTaste = task.brief.participants.some((person) =>
      person.preferences.some(
        (preference) =>
          preference.confirmed &&
          preference.polarity === "like" &&
          preference.entityType,
      ),
    );

    if (
      task.mode === "qloo-live" &&
      !localChangeOnly &&
      !task.catalogue.length &&
      !task.brief.contextAnchor &&
      !hasTaste
    ) {
      task.status = "clarification";
      task.brief.unresolved = [
        "What is one artist, film, book or place you enjoy that could guide this?",
      ];
      trace(
        "planner.clarify",
        "Cultural discovery needs a supplied taste reference.",
      );

      return task;
    }

    const culturalCurrent =
      task.catalogue.length > 0 && hasCurrentEvidence(task, "cultural");
    const factsCurrent =
      task.catalogue.length === task.candidates.length &&
      hasCurrentEvidence(task, "practical");
    const plan = planCapabilities({
      goal: task.brief.kind,
      mode: artifactEdit ? "edit" : localChangeOnly ? "memory" : "refresh",
      discover: needsDiscovery || !culturalCurrent,
      factsCurrent,
      participantCount: task.brief.participants.length,
    });

    if (plan.status === "blocked") {
      task.status = "clarification";
      task.brief.unresolved = [plan.reason];

      return task;
    }

    if (!localChangeOnly) {
      trace(
        "planner",
        `Selected ${plan.goal}: ${plan.actions.map((action) => `${action.capability}.${action.operation}`).join(" → ")}.`,
      );
    }

    if (!plan.actions.length) {
      trace(
        "context.memory",
        "Updated explicitly approved memory. No discovery called.",
      );
      task.status = task.artifacts.some(
        (artifact) => artifact.freshness === "stale",
      )
        ? "partial"
        : "ready";

      return task;
    }

    let refreshFacts = plan.refreshFacts;

    for (const action of plan.actions) {
      let completed = true;

      switch (action.capability) {
        case "discover":
          if (action.operation === "resolve") {
            completed = await resolveProfileIdentities(task, context);
          } else {
            const factsChanged = await retrieveCulturalOptions(task, context);
            completed = factsChanged !== undefined;
            refreshFacts ||= factsChanged ?? false;
          }

          break;
        case "evaluate":
          if (action.operation === "eligibility") {
            completed = await checkPracticalEligibility(
              task,
              context,
              refreshFacts,
            );
          } else {
            await checkOutcomeIntegrity(task, context);
          }

          break;
        case "collaborate":
          await compareParticipants(task, context);
          break;
        case "compose":
          if (action.operation === "edit" && artifactEdit) {
            await editArtifact(
              task,
              context,
              artifactEdit,
              editedArtifactWasCurrent,
            );
          } else {
            await composeOutcome(task, context);
          }

          break;
      }

      if (!completed) {
        break;
      }
    }
  } catch (error) {
    task.status = "error";
    task.error =
      error instanceof Error && error.message.includes("timed out")
        ? "A tool timed out. Retry the action or restore normal fixture mode."
        : error instanceof Error && error.message.includes("budget")
          ? "Execution budget reached. Narrow the task and retry."
          : "The action could not be completed safely. Review the brief or restore normal fixture mode.";

    for (const a of task.artifacts) {
      a.freshness = "stale";
    }

    trace("execution.error", task.error);
  }

  return task;
}

function hasCurrentEvidence(task: Task, kind: "cultural" | "practical") {
  return task.catalogue.every((candidate) =>
    task.evidence.some(
      (evidence) =>
        isEvidenceKind(evidence, kind) &&
        evidence.freshness === "current" &&
        evidence.entityIds.includes(candidateIdentity(candidate)),
    ),
  );
}

function planningFactsKey(options: Task["catalogue"]) {
  return JSON.stringify(
    options.map((candidate) => [
      candidate.id,
      candidate.providerId,
      candidate.cost,
      candidate.duration,
      candidate.available,
      candidate.location,
    ]),
  );
}

function requireCapabilityData<T>(result: CapabilityResult<T>): T {
  if (result.error || result.data === null) {
    throw new Error("Capability rejected an unsafe execution");
  }

  return result.data;
}

function isIncompleteResult(result: CapabilityResult<unknown>) {
  return ["error", "blocked", "empty"].includes(result.status) && !result.error;
}

function markPartial(task: Task, warnings: string[]) {
  task.status = "partial";
  task.error =
    warnings.join(" ") || "No usable results. Review the inputs or retry.";
  task.candidates = [];
  task.schedule = [];
  task.brief.selected = [];

  for (const a of task.artifacts) {
    a.freshness = "stale";
  }
}

async function resolveProfileIdentities(
  task: Task,
  context: CapabilityContext,
): Promise<boolean> {
  const { trace } = context;

  const categories = new Map<string, Set<string>>();

  for (const participant of task.brief.participants) {
    for (const preference of participant.preferences) {
      if (
        !preference.confirmed ||
        preference.polarity !== "like" ||
        !preference.entityType
      ) {
        continue;
      }

      const key = preference.value.normalize("NFKC").toLowerCase();
      const set = categories.get(key) ?? new Set<string>();
      set.add(preference.entityType);
      categories.set(key, set);
    }
  }

  const collision = [...categories].find(([, types]) => types.size > 1);

  if (collision) {
    task.status = "clarification";
    task.brief.unresolved = [
      `${collision[0]} is used for more than one cultural category. Supply disambiguated names before resolving these profiles.`,
    ];
    trace("clarify", task.brief.unresolved[0]);

    return false;
  }

  const terms = [
    ...new Set(
      task.brief.participants.flatMap((participant) =>
        participant.preferences
          .filter(
            (x) =>
              x.confirmed &&
              x.polarity === "like" &&
              (x.entityType || /^[A-Z]/.test(x.value)),
          )
          .map((x) => x.value),
      ),
    ),
  ];
  const result = await executeCapability(
    capabilities.discover,
    {
      operation: "resolve",
      terms: task.brief.contextAnchor ? [] : terms,
      entities: task.entities,
      intendedTypes: Object.fromEntries(
        task.brief.participants.flatMap((participant) =>
          participant.preferences
            .filter((preference) => preference.entityType)
            .map((preference) => [preference.value, preference.entityType]),
        ),
      ),
    },
    context,
  );
  const output = requireCapabilityData(result);
  task.entities = output.entities;

  if (isIncompleteResult(result)) {
    markPartial(task, result.warnings);

    return false;
  }

  task.brief.unresolved = output.unresolved;

  if (result.status === "ambiguous") {
    task.status = "clarification";

    return false;
  }

  return true;
}

async function retrieveCulturalOptions(
  task: Task,
  context: CapabilityContext,
): Promise<boolean | undefined> {
  const stageVersion = task.brief.version;

  const result = await executeCapability(
    capabilities.discover,
    {
      operation: "retrieve",
      entities: task.entities,
      participants: task.brief.participants,
      catalogue: task.catalogue,
      location: task.brief.constraints.location,
      anchor: task.brief.contextAnchor,
      targetTypes: task.brief.targetType ? [task.brief.targetType] : undefined,
      version: stageVersion,
      mode: task.simulation,
    },
    context,
  );
  const output = requireCapabilityData(result);

  if (isIncompleteResult(result)) {
    markPartial(task, result.warnings);

    return undefined;
  }

  const factsChanged =
    planningFactsKey(task.catalogue) !== planningFactsKey(output.options);

  task.evidence = replaceEvidence(task.evidence, output.evidence, "cultural");
  task.catalogue = output.options;

  return factsChanged;
}

async function checkPracticalEligibility(
  task: Task,
  context: CapabilityContext,
  refreshFacts: boolean,
): Promise<boolean> {
  const result = await executeCapability(
    capabilities.evaluate,
    {
      operation: "eligibility",
      options: task.catalogue,
      brief: task.brief,
      evidence: task.evidence,
      checkedOptions: task.candidates,
      refreshFacts,
    },
    context,
  );
  const output = requireCapabilityData(result);

  if (isIncompleteResult(result)) {
    markPartial(task, result.warnings);

    return false;
  }

  task.candidates = output.candidates;
  task.evidence = output.evidence;

  return true;
}

async function checkOutcomeIntegrity(task: Task, context: CapabilityContext) {
  requireCapabilityData(
    await executeCapability(
      capabilities.evaluate,
      {
        operation: "integrity",
        brief: task.brief,
        candidates: task.candidates,
        evidence: task.evidence,
        artifacts: task.artifacts,
        schedule: task.schedule,
      },
      context,
    ),
  );
}

async function compareParticipants(task: Task, context: CapabilityContext) {
  const output = requireCapabilityData(
    await executeCapability(
      capabilities.collaborate,
      {
        participants: task.brief.participants,
        candidates: task.candidates,
      },
      context,
    ),
  );
  task.candidates = output.candidates;
}

async function editArtifact(
  task: Task,
  context: CapabilityContext,
  artifactEdit: ArtifactEdit,
  editedArtifactWasCurrent: boolean,
) {
  const output = requireCapabilityData(
    await executeCapability(
      capabilities.compose,
      {
        operation: "edit",
        artifact: task.artifacts.find((a) => a.id === artifactEdit.artifactId),
        content: artifactEdit.content,
        evidence: task.evidence,
        wasCurrent: editedArtifactWasCurrent,
      },
      context,
    ),
  );
  task.artifacts = task.artifacts.map(
    (a) => output.artifacts.find((updated) => updated.id === a.id) ?? a,
  );
  task.status = task.artifacts.some((a) => a.freshness === "stale")
    ? "partial"
    : "ready";
}

async function composeOutcome(task: Task, context: CapabilityContext) {
  const output = requireCapabilityData(
    await executeCapability(
      capabilities.compose,
      {
        operation: "create",
        brief: task.brief,
        candidates: task.candidates,
        evidence: task.evidence,
        artifacts: task.artifacts,
      },
      context,
    ),
  );
  task.artifacts = mergeArtifacts(task.artifacts, output.artifacts);
  task.schedule = output.schedule ?? [];
  task.brief.selected = output.selected ?? [];
  task.status = output.status;
}
