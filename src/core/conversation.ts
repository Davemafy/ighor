import { randomUUID } from "node:crypto";
import {
  type Task,
  type Artifact,
  ConversationActionSchema,
} from "./contracts";
import { z } from "zod";

const normalize = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase();

function findUnambiguous<T>(
  items: T[],
  reference: string,
  names: (item: T) => string[],
) {
  const matched = items.filter((item) =>
    names(item).some((name) => normalize(name) === normalize(reference)),
  );

  if (matched.length !== 1) {
    throw new Error(
      `Which ${reference} do you mean? Choose one unambiguous name or ID from the current workspace.`,
    );
  }

  return matched[0];
}

type ConversationAction = z.infer<typeof ConversationActionSchema>;
interface EditContext {
  task: Task;
  text: string;
  changed: Set<string>;
  constraintValues: Map<string, unknown>;
  factValues: Map<string, unknown>;
  needsDiscovery: boolean;
  artifact?: { artifactId: string; content: string };
}

/** All corrections are staged on a clone; ambiguity discards the entire batch. */
export function applyConversationActions(
  original: Task,
  raw: unknown,
  text: string,
) {
  const validated = z
    .array(ConversationActionSchema)
    .min(1)
    .max(8)
    .safeParse(raw);

  if (!validated.success) {
    return {
      ok: false as const,
      question:
        "The proposed edits failed validation. State one supported correction at a time.",
    };
  }

  const actions = validated.data;
  const edit: EditContext = {
    task: structuredClone(original),
    text,
    changed: new Set(),
    constraintValues: new Map(),
    factValues: new Map(),
    needsDiscovery: false,
  };

  try {
    if (
      actions.some((action) => action.kind === "artifact") &&
      actions.length > 1
    ) {
      throw new Error(
        "Save the document wording separately from planning corrections so neither change is lost.",
      );
    }

    for (const action of actions) {
      switch (action.kind) {
        case "profile":
          applyProfile(edit, action);
          break;
        case "constraints":
          applyConstraintCorrection(edit, action);
          break;
        case "preference":
          applyPreferenceCorrection(edit, action);
          break;
        case "facts":
          applyPracticalFacts(edit, action);
          break;
        case "resolve":
          resolveOfferedIdentity(edit, action);
          break;
        case "select":
          applyPinnedSelection(edit, action);
          break;
        case "artifact":
          applyDocumentCorrection(edit, action);
          break;
      }
    }

    return {
      ok: true as const,
      task: edit.task,
      changed: [...edit.changed],
      discover: edit.needsDiscovery,
      artifact: edit.artifact,
    };
  } catch (error) {
    return {
      ok: false as const,
      question:
        error instanceof Error
          ? error.message
          : "Clarify this correction before it is applied.",
    };
  }
}

function requireExplicitText(text: string, value: string) {
  if (!normalize(text).includes(normalize(value))) {
    throw new Error(`Please state ${value} explicitly before changing it.`);
  }
}

function requireExplicitNumber(text: string, value: number) {
  const supplied = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) =>
    Number(match[0]),
  );

  if (!supplied.includes(value)) {
    throw new Error(
      "State the numeric planning fact explicitly; Igor will not invent it.",
    );
  }
}

function applyConstraintCorrection(
  edit: EditContext,
  action: Extract<ConversationAction, { kind: "constraints" }>,
) {
  const { task, changed, constraintValues, text } = edit;

  for (const field of ["budget", "duration", "location"] as const) {
    if (action[field] === undefined) {
      continue;
    }

    if (
      constraintValues.has(field) &&
      constraintValues.get(field) !== action[field]
    ) {
      throw new Error(
        `Clarify the conflicting ${field} values before applying this turn.`,
      );
    }

    constraintValues.set(field, action[field]);
  }

  if (action.budget !== undefined) {
    requireExplicitNumber(text, action.budget);
    const amount = String(action.budget).replaceAll(".", "\\.");
    const explicitBudget = new RegExp(
      `\\bbudget(?:\\s+(?:is|to|of))?\\s*[:=]?\\s*\\$?\\s*${amount}(?!\\d|\\.\\d)`,
      "i",
    ).test(text);

    if (
      !explicitBudget &&
      (/\bbudget\b/i.test(text) ||
        !new RegExp(`\\$\\s*${amount}(?!\\d|\\.\\d)`).test(text))
    ) {
      throw new Error(
        "Clarify the budget amount; another number cannot become the spending limit.",
      );
    }

    task.brief.constraints.budget = action.budget;
    changed.add("budget");
  }

  if (action.duration !== undefined) {
    const words: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
    };
    const hours = [
      ...text.matchAll(
        /\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*hours?\b/gi,
      ),
    ];

    if (
      !hours.some(
        (m) =>
          Math.round((words[m[1].toLowerCase()] ?? Number(m[1])) * 60) ===
          action.duration,
      )
    ) {
      requireExplicitNumber(text, action.duration);

      if (
        !new RegExp(
          `(?:duration|time limit)\\s*(?:is|to|of)?\\s*[:=]?\\s*${action.duration}(?!\\d)|${action.duration}\\s*(?:minutes?|mins?)\\b`,
          "i",
        ).test(text)
      ) {
        throw new Error(
          "Clarify the time limit; a budget amount cannot become activity minutes.",
        );
      }
    }

    task.brief.constraints.duration = action.duration;
    changed.add("duration");
  }

  if (action.location !== undefined) {
    requireExplicitText(text, action.location);

    if (task.brief.constraints.location === action.location) {
      return;
    }

    task.brief.constraints.location = action.location;
    changed.add("location");
    edit.needsDiscovery = true;
  }
}

function applyPreferenceCorrection(
  edit: EditContext,
  action: Extract<ConversationAction, { kind: "preference" }>,
) {
  const { task, changed, text } = edit;

  const participant = findUnambiguous(
    task.brief.participants,
    action.participant,
    (participant) => [participant.id, participant.name],
  );

  if (
    !(participant.id === "you" && /\b(?:I|my|me)\b/i.test(text)) &&
    !normalize(text).includes(normalize(participant.id))
  ) {
    requireExplicitText(text, participant.name);
  }

  requireExplicitText(text, action.value);
  const old = participant.preferences.find(
    (preference) => normalize(preference.value) === normalize(action.value),
  );
  const preference = {
    id: old?.id ?? randomUUID(),
    subject: participant.id,
    value: action.value,
    polarity: action.polarity,
    source: "user-supplied" as const,
    confirmed: true,
    scope: "participant" as const,
    ...(action.entityType
      ? { entityType: action.entityType }
      : old?.entityType
        ? { entityType: old.entityType }
        : {}),
  };
  participant.preferences = [
    ...participant.preferences.filter((item) => item.id !== preference.id),
    preference,
  ];

  if (participant.preferences.length > 20) {
    throw new Error(
      "Review this participant's preferences before adding more.",
    );
  }

  changed.add(`preferences:${participant.id}`);
  changed.add("selection");
  edit.needsDiscovery = true;
}

function applyProfile(
  edit: EditContext,
  action: Extract<ConversationAction, { kind: "profile" }>,
) {
  const { task, text, changed } = edit;
  const personal = normalize(action.participant) === "you";

  if (personal) {
    if (!/\b(?:I|my|me)\b/i.test(text)) {
      throw new Error(
        "Whose taste should Igor use? State your own preferences or name the person.",
      );
    }
  } else {
    requireExplicitText(text, action.participant);
  }

  // A real opening profile replaces demo people; it never inherits their taste.
  if (
    task.brief.participants.length &&
    task.brief.participants.every((person) => person.sample)
  ) {
    for (const person of task.brief.participants) {
      changed.add(`preferences:${person.id}`);
    }

    task.brief.participants = [];
    task.brief.suppliedFacts = task.brief.suppliedFacts.filter(
      (fact) => !(/profiles/i.test(fact) && /sample|illustrative/i.test(fact)),
    );
    task.brief.suppliedFacts.push(
      "Taste profiles supplied in this conversation; not saved to persistent memory.",
    );
    task.entities = [];
    changed.add("catalogue");
  }

  const matches = task.brief.participants.filter(
    (person) =>
      normalize(person.id) === normalize(action.participant) ||
      normalize(person.name) === normalize(action.participant),
  );

  if (matches.length > 1) {
    throw new Error(
      "More than one participant matches. Use an unambiguous name or ID.",
    );
  }

  let person = matches[0];

  if (!person) {
    if (task.brief.participants.length >= 12) {
      throw new Error("This workspace supports up to twelve participants.");
    }

    person = {
      id: personal ? "you" : randomUUID(),
      name: personal ? "You" : action.participant,
      preferences: [],
      sample: false,
    };
    task.brief.participants.push(person);
  }

  for (const preference of action.preferences) {
    // Profile creation shares correction grounding, attribution and limits.
    applyPreferenceCorrection(edit, {
      kind: "preference",
      participant: person.id,
      ...preference,
    });
  }
}

function applyPracticalFacts(
  edit: EditContext,
  action: Extract<ConversationAction, { kind: "facts" }>,
) {
  const { task, changed, factValues, text } = edit;

  const options =
    normalize(action.candidate) === "all"
      ? task.catalogue
      : [
          findUnambiguous(task.catalogue, action.candidate, (candidate) => [
            candidate.id,
            candidate.name,
          ]),
        ];

  if (normalize(action.candidate) === "all") {
    requireExplicitText(text, "all");
  } else {
    const option = options[0];

    if (!normalize(text).includes(normalize(option.id))) {
      requireExplicitText(text, option.name);
    }
  }

  if (!options.length) {
    throw new Error(
      "Retrieve a candidate pool before supplying practical facts.",
    );
  }

  if (action.cost !== undefined && action.cost !== null) {
    requireExplicitNumber(text, action.cost);
  }

  if (action.duration !== undefined && action.duration !== null) {
    requireExplicitNumber(text, action.duration);
  }

  if (action.cost !== undefined && action.cost !== null) {
    const value = String(action.cost).replaceAll(".", "\\.");

    if (
      !new RegExp(
        `(?:cost|price)\\s*(?:is\\s*)?\\$?\\s*${value}(?!\\d|\\.\\d)|\\$\\s*${value}(?!\\d|\\.\\d)`,
        "i",
      ).test(text)
    ) {
      throw new Error(
        "Clarify the cost explicitly; a duration cannot be used as a price.",
      );
    }
  }

  if (action.duration !== undefined && action.duration !== null) {
    const value = String(action.duration);

    if (
      !new RegExp(
        `(?:duration|runtime)\\s*(?:is\\s*)?${value}(?!\\d)|${value}\\s*(?:minutes?|mins?)\\b`,
        "i",
      ).test(text)
    ) {
      throw new Error(
        "Clarify the activity minutes explicitly; a price cannot be used as a duration.",
      );
    }
  }

  if (
    action.cost === null &&
    !/(?:cost|price)\s+(?:is\s+)?unknown/i.test(text)
  ) {
    throw new Error("State that the cost is unknown before clearing it.");
  }

  if (
    action.duration === null &&
    !/(?:duration|runtime)\s+(?:is\s+)?unknown/i.test(text)
  ) {
    throw new Error("State that the duration is unknown before clearing it.");
  }

  if (
    action.available !== undefined &&
    action.available !== null &&
    !(action.available
      ? /\b(access|availability)\s+(confirmed|available)|\bis available\b/i.test(
          text,
        )
      : /\bunavailable\b|\bno access\b|\bnot available\b/i.test(text))
  ) {
    throw new Error(
      "State access or availability explicitly; it cannot be inferred from a price.",
    );
  }

  if (action.available === null && !/unknown|unsure|not know/i.test(text)) {
    throw new Error("State that availability is unknown before clearing it.");
  }

  for (const candidate of options) {
    for (const field of ["cost", "duration", "available"] as const) {
      if (action[field] === undefined) {
        continue;
      }

      const key = `${candidate.id}:${field}`;

      if (factValues.has(key) && factValues.get(key) !== action[field]) {
        throw new Error(
          `Clarify the conflicting ${field} values for ${candidate.name} before applying this turn.`,
        );
      }

      factValues.set(key, action[field]);
    }

    const at = new Date().toISOString();

    if (action.cost !== undefined) {
      candidate.cost = {
        value: action.cost,
        source: "user-supplied",
        reference:
          "Explicit conversational operator input; not independently verified",
        at,
      };
    }

    if (action.duration !== undefined) {
      candidate.duration = {
        value: action.duration,
        source: "user-supplied",
        reference:
          "Explicit conversational activity length; not a verified full runtime",
        at,
      };
    }

    if (action.available !== undefined) {
      candidate.available = action.available;
      candidate.availabilitySource = "user-supplied";
    }

    candidate.location = task.brief.constraints.location;
  }

  changed.add("catalogue");
  edit.needsDiscovery = true;
}

function resolveOfferedIdentity(
  edit: EditContext,
  action: Extract<ConversationAction, { kind: "resolve" }>,
) {
  const { task, changed, text } = edit;

  const entity = findUnambiguous(task.entities, action.entity, (entity) => [
    entity.id,
    entity.original,
  ]);
  const choices = entity.choices.filter(
    (c) =>
      c.id === action.choice ||
      normalize(c.name) === normalize(action.choice) ||
      (c.metadata &&
        /^(19|20)\d{2}$/.test(action.choice) &&
        c.metadata.includes(`"releaseYear":${action.choice}`)),
  );

  if (choices.length !== 1) {
    throw new Error(
      `Which ${entity.original} identity? Supply one offered ID or an unambiguous release year.`,
    );
  }

  if (choices[0].id !== action.choice) {
    requireExplicitText(text, action.choice);
  }

  const choice = choices[0];
  Object.assign(entity, {
    providerId: choice.id,
    name: choice.name,
    type: choice.type,
    status: "resolved",
    metadata: "Explicit conversational choice. " + (choice.metadata ?? ""),
  });
  changed.add("selection");
  edit.needsDiscovery = true;
}

function applyPinnedSelection(
  edit: EditContext,
  action: Extract<ConversationAction, { kind: "select" }>,
) {
  const { task, changed, text } = edit;

  if (
    !action.candidates.length &&
    !/selection|choose|unpin|automatic/i.test(text)
  ) {
    throw new Error(
      "Explicitly clear the selection before removing your pinned choices.",
    );
  }

  const ids = action.candidates.map((reference) => {
    const candidate = findUnambiguous(
      task.catalogue,
      reference,
      (candidate) => [candidate.id, candidate.name],
    );

    if (!normalize(text).includes(normalize(candidate.id))) {
      requireExplicitText(text, candidate.name);
    }

    return candidate.id;
  });

  if (new Set(ids).size !== ids.length) {
    throw new Error("Choose each candidate once.");
  }

  task.brief.pinned = ids;
  changed.add("selection");
}

function applyDocumentCorrection(
  edit: EditContext,
  action: Extract<ConversationAction, { kind: "artifact" }>,
) {
  const { task, changed } = edit;

  if (!task.artifacts.some((a: Artifact) => a.id === action.artifactId)) {
    throw new Error("Create the artifact before editing it.");
  }

  edit.artifact = { artifactId: action.artifactId, content: action.content };
  changed.add(action.artifactId);
}
