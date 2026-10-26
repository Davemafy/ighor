import { readRecordingText } from "../../src/tools/recording-file";
import { afterEach, describe, expect, it } from "vitest";
import { freshLiveTask } from "../../src/data/live-task";
import { freshTask } from "../../src/data/fixtures";
import { RecordedQlooProvider } from "../../src/tools/recorded-qloo";
import { SqliteTaskStore, ConflictError } from "../../src/data/store";
import { runTurn } from "../../src/core/orchestrator";
import { applyConversationActions } from "../../src/core/conversation";
import {
  ConversationActionSchema,
  TaskSchema,
  type Task,
  type Event,
} from "../../src/core/contracts";
import { DevelopmentModel } from "../../src/tools/development-model";
import { assertArtifactIntegrity } from "../../src/capabilities/evaluate";
import type { ModelProvider } from "../../src/tools/interfaces";
import { FixtureCulturalProvider } from "../../src/tools/fixture-provider";

const recording = JSON.parse(
  readRecordingText("tests/fixtures/qloo-cultural.json.gz"),
);

const stores: SqliteTaskStore[] = [];

afterEach(() => stores.splice(0).forEach((s) => s.close()));

function setup() {
  const store = new SqliteTaskStore(":memory:");
  stores.push(store);
  store.create(freshLiveTask("t", "o"));

  return { store, provider: new RecordedQlooProvider(recording) };
}

async function message(
  store: SqliteTaskStore,
  provider: RecordedQlooProvider,
  task: Task,
  text: string,
  emit?: (e: Event) => void,
) {
  return runTurn(
    store,
    "t",
    "o",
    { type: "message", text, version: task.brief.version },
    emit,
    provider,
  );
}

describe("Conversation-to-outcome backend over real archived Qloo data", () => {
  it("grounds legacy model fields instead of accepting invented budget and duration", async () => {
    const { store, provider } = setup();
    const before = store.load("t", "o");
    const model: ModelProvider = {
      async interpret() {
        return {
          supported: true,
          intent: "revision",
          kind: "gathering",
          goal: "",
          budget: 999,
          duration: 900,
        };
      },
    };
    const result = await runTurn(
      store,
      "t",
      "o",
      { type: "message", text: "Make this more intimate.", version: 0 },
      undefined,
      provider,
      model,
    );
    expect(result.status).toBe("clarification");
    expect(result.brief.constraints).toEqual(before.brief.constraints);
    expect(provider.calls).toBe(0);
  });
  it("does not swap budget numbers and duration numbers even when both appear in the user request", () => {
    const task = freshTask("t", "o");
    const before = structuredClone(task);
    expect(
      applyConversationActions(
        task,
        [{ kind: "constraints", budget: 180, duration: 60 }],
        "Budget $60 and duration 180 minutes.",
      ).ok,
    ).toBe(false);
    expect(
      applyConversationActions(
        task,
        [{ kind: "constraints", budget: 60, duration: 180 }],
        "Budget $60 and duration 180 minutes.",
      ).ok,
    ).toBe(true);
    expect(task).toEqual(before);
  });
  it("allows split fact actions but rejects contradictory facts atomically", () => {
    const task = freshTask("t", "o");
    const name = task.catalogue[0].name;
    const split = applyConversationActions(
      task,
      [
        { kind: "facts", candidate: name, cost: 5 },
        { kind: "facts", candidate: name, duration: 80, available: true },
      ],
      `For ${name}: cost $5, duration 80 minutes, access confirmed.`,
    );
    expect(split.ok).toBe(true);

    if (split.ok) {
      expect(split.task.catalogue[0]).toMatchObject({
        cost: { value: 5 },
        duration: { value: 80 },
        available: true,
      });
    }

    const before = structuredClone(task);
    const conflict = applyConversationActions(
      task,
      [
        { kind: "facts", candidate: name, cost: 5 },
        { kind: "facts", candidate: name, cost: 6 },
      ],
      `For ${name}: cost $5 or cost $6.`,
    );
    expect(conflict.ok).toBe(false);
    expect(task).toEqual(before);
  });
  it("deduplicates equivalent legacy and typed invitation edits without discovery", async () => {
    const store = new SqliteTaskStore(":memory:");
    stores.push(store);
    store.create(freshTask("t", "o"));
    const provider = new FixtureCulturalProvider();
    let task = await runTurn(
      store,
      "t",
      "o",
      { type: "sample", example: "common", version: 0 },
      undefined,
      provider,
    );
    const model: ModelProvider = {
      async interpret() {
        return {
          supported: true,
          intent: "revision",
          kind: "gathering",
          goal: "",
          wording: "Bring curiosity.",
          actions: [
            {
              kind: "artifact",
              artifactId: "invitation",
              content: "Bring curiosity.",
            },
          ],
        };
      },
    };
    task = await runTurn(
      store,
      "t",
      "o",
      {
        type: "message",
        text: "Invitation: Bring curiosity.",
        version: task.brief.version,
      },
      undefined,
      provider,
      model,
    );
    expect(task.artifacts.find((a) => a.id === "invitation")?.content).toBe(
      "Bring curiosity.",
    );
    expect(task.receipts?.at(-1)?.culturalRequests).toBe(0);
  });
  it("resolves explicitly typed lowercase cultural names instead of relying on capitalization", async () => {
    const store = new SqliteTaskStore(":memory:");
    stores.push(store);
    const task = freshTask("t", "o");
    task.brief.goal = "Plan a gathering";
    task.brief.participants[0].preferences[0].value = "radiohead";
    task.brief.participants[0].preferences[0].entityType = "artist";
    store.create(task);
    const result = await runTurn(
      store,
      "t",
      "o",
      { type: "constraints", budget: 50, version: 0 },
      undefined,
      new FixtureCulturalProvider(),
    );
    expect(
      result.entities.find((e) => e.original === "radiohead")?.status,
    ).toBe("resolved");
  });
  it("completes the gathering through conversation, with eligibility, pins, targeted revisions and inspectable receipts", async () => {
    const { store, provider } = setup();
    let task = store.load("t", "o");
    task = await message(
      store,
      provider,
      task,
      "Plan a gathering for six friends, budget $60 and 180 minutes.",
    );
    expect(task.status).toBe("clarification");
    expect(task.brief.unresolved.join()).toContain("Moonlight");
    task = await message(store, provider, task, "Use Moonlight from 2016.");
    expect(task.status).toBe("partial");
    expect(task.candidates).toHaveLength(30);
    task = await message(
      store,
      provider,
      task,
      "For Children of Men: cost $5, duration 80 minutes, access confirmed.",
    );
    task = await message(
      store,
      provider,
      task,
      "For Thom Yorke: cost $5, duration 15 minutes, access confirmed.",
    );
    expect(task.status).toBe("ready");
    expect(task.brief.selected).toHaveLength(2);
    expect(task.schedule.reduce((n, s) => n + s.minutes, 0)).toBe(135);
    expect(
      task.candidates.filter((c) => c.eligibility === "eligible"),
    ).toHaveLength(2);
    expect(
      task.candidates.filter((c) => c.eligibility === "needs-review"),
    ).toHaveLength(28);
    task = await message(
      store,
      provider,
      task,
      "Choose Children of Men and Thom Yorke.",
    );
    expect(task.brief.pinned).toHaveLength(2);
    expect(task.brief.selected).toHaveLength(2);
    const discoveryBefore = task.trace.filter(
      (t) => t.action === "cultural.discover",
    ).length;
    task = await message(
      store,
      provider,
      task,
      "Invitation: Bring your curiosity.",
    );
    expect(task.artifacts.find((a) => a.id === "invitation")?.content).toBe(
      "Bring your curiosity.",
    );
    expect(
      task.trace.filter((t) => t.action === "cultural.discover"),
    ).toHaveLength(discoveryBefore);
    expect(task.receipts?.at(-1)?.changed).toContain("invitation");
    task = await message(store, provider, task, "Lower budget to $1");
    expect(task.brief.selected).toEqual([]);
    expect(task.receipts?.at(-1)).toMatchObject({
      culturalRequests: 0,
      modelRequests: 0,
      status: "partial",
    });
    task = await message(store, provider, task, "Budget $60");
    const states: Task[] = [];
    task = await message(
      store,
      provider,
      task,
      "Replace Amara's Radiohead with Kendrick Lamar.",
      (e) => {
        if (e.type === "state" && e.task) {
          states.push(e.task);
        }
      },
    );
    expect(states[0].artifacts.every((a) => a.freshness === "stale")).toBe(
      true,
    );
    const amara = task.brief.participants.find((p) => p.id === "amara")!;
    expect(
      amara.preferences.find((p) => p.value === "Radiohead")?.polarity,
    ).toBe("unknown");
    expect(
      amara.preferences.find((p) => p.value === "Kendrick Lamar")?.polarity,
    ).toBe("like");
    expect(task.receipts?.at(-1)?.changed).toContain("preferences:amara");
    expect(
      task.receipts?.every(
        (r) => r.culturalRequests === 0 && r.inputHash.length === 64,
      ),
    ).toBe(true);
    expect(provider.calls).toBe(0);
    expect(() => assertArtifactIntegrity(task)).not.toThrow();
    expect(() => TaskSchema.parse(task)).not.toThrow();
  });
  it("asks a focused clarification without mutating facts when a reference is ambiguous", async () => {
    const { store, provider } = setup();
    let task = await runTurn(
      store,
      "t",
      "o",
      { type: "sample", version: 0 },
      undefined,
      provider,
    );
    const before = structuredClone(task.brief.participants);
    task = await message(store, provider, task, "Alex likes Radiohead.");
    expect(task.status).toBe("clarification");
    expect(task.brief.unresolved.join()).toContain("Alex");
    expect(task.brief.participants).toEqual(before);
  });
  it("applies compound edits atomically; one ambiguous participant prevents every proposed change", () => {
    const task = freshTask("t", "o");
    const before = JSON.stringify(task);
    const result = applyConversationActions(
      task,
      [
        { kind: "constraints", budget: 1 },
        {
          kind: "preference",
          participant: "Unknown person",
          value: "Radiohead",
          polarity: "like",
        },
      ],
      "Budget $1; Unknown person likes Radiohead",
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(task)).toBe(before);
  });
  it("does not invent facts, availability, identities, recipients, or tool privileges", () => {
    const task = freshTask("t", "o");

    for (const [actions, text] of [
      [
        [{ kind: "facts", candidate: "Moonrise Kingdom", cost: 999 }],
        "For Moonrise Kingdom: cost $5",
      ],
      [
        [{ kind: "facts", candidate: "Moonrise Kingdom", available: true }],
        "For Moonrise Kingdom: cost $5",
      ],
      [
        [{ kind: "facts", candidate: "Moonrise Kingdom", available: false }],
        "For Moonrise Kingdom: access confirmed",
      ],
      [[{ kind: "select", candidates: ["invented"] }], "Choose invented"],
      [
        [
          {
            kind: "preference",
            participant: "Amara",
            value: "Invented taste",
            polarity: "like",
          },
        ],
        "Amara likes Radiohead",
      ],
    ] as const) {
      expect(applyConversationActions(task, actions, text).ok).toBe(false);
    }

    expect(() =>
      ConversationActionSchema.parse({
        kind: "send_invitation",
        recipient: "someone",
      }),
    ).toThrow();
    expect(() =>
      ConversationActionSchema.parse({
        kind: "facts",
        candidate: "x",
        cost: 5,
        source: "verified-external",
      }),
    ).toThrow();
  });
  it("a pinned option cannot bypass constraints or stale evidence", async () => {
    const { store, provider } = setup();
    let task = await runTurn(
      store,
      "t",
      "o",
      { type: "sample", version: 0 },
      undefined,
      provider,
    );
    task = await message(store, provider, task, "Use Moonlight from 2016.");
    task = await message(store, provider, task, "Choose Children of Men.");
    expect(task.brief.pinned).toHaveLength(1);
    expect(task.brief.selected).toEqual([]);
    expect(task.status).toBe("partial");
  });
  it("preserves temporary non-interest and unknown separately from dislike", async () => {
    const model = new DevelopmentModel();
    expect(
      (await model.interpret("Amara is not interested in Radiohead"))
        .actions?.[0],
    ).toMatchObject({ polarity: "not-now" });
    expect(
      (await model.interpret("Amara is unsure about Radiohead")).actions?.[0],
    ).toMatchObject({ polarity: "unknown" });
    expect(
      (await model.interpret("Amara dislikes Radiohead")).actions?.[0],
    ).toMatchObject({ polarity: "dislike" });
  });
  it("keeps a bounded receipt history through repeated edits and permits explicitly clearing pins", async () => {
    const { store, provider } = setup();
    let task = store.load("t", "o");
    task = await message(
      store,
      provider,
      task,
      "Plan a gathering for six friends",
    );
    task = await message(store, provider, task, "Use Moonlight from 2016.");
    task = await message(store, provider, task, "Choose Children of Men.");
    expect(task.brief.pinned).toHaveLength(1);
    task = await message(store, provider, task, "Let Igor choose.");
    expect(task.brief.pinned).toEqual([]);

    for (let n = 0; n < 42; n++) {
      task = await message(store, provider, task, `Invitation: Draft ${n}`);
    }

    expect(task.receipts).toHaveLength(40);
    expect(task.trace.length).toBeLessThanOrEqual(100);
    expect(
      task.receipts!.every(
        (r) => r.toVersion > r.fromVersion && r.culturalRequests === 0,
      ),
    ).toBe(true);
  });
  it("rejects contradictory constraint extractions rather than silently choosing one", () => {
    const task = freshTask("t", "o");
    const result = applyConversationActions(
      task,
      [
        { kind: "constraints", budget: 20 },
        { kind: "constraints", budget: 30 },
      ],
      "Budget $20, or $30",
    );
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.question).toContain("conflicting budget");
    }

    expect(task.brief.constraints.budget).toBe(60);
  });
  it("does not misattribute stated durations as prices or clear known facts from unrelated unknowns", () => {
    const task = freshTask("t", "o");

    for (const action of [
      { kind: "facts", candidate: "Moonrise Kingdom", cost: 80, duration: 5 },
      { kind: "facts", candidate: "Moonrise Kingdom", cost: null },
    ]) {
      expect(
        applyConversationActions(
          task,
          [action],
          "For Moonrise Kingdom: cost $5, duration 80 minutes, access unknown",
        ).ok,
      ).toBe(false);
    }
  });
  it("records a safe failed-model receipt and retains the last decisions without leaking errors", async () => {
    const { store, provider } = setup();
    let prior = store.load("t", "o");
    prior = await message(
      store,
      provider,
      prior,
      "Plan a gathering for six friends",
    );
    prior = await message(store, provider, prior, "Use Moonlight from 2016.");
    prior = await message(
      store,
      provider,
      prior,
      "For Children of Men: cost $5, duration 80 minutes, access confirmed.",
    );
    expect(prior.status).toBe("ready");
    const privateKey = "private-credential-marker";
    const model: ModelProvider = {
      interpret: async () => {
        throw new Error(privateKey);
      },
    };
    const result = await runTurn(
      store,
      "t",
      "o",
      {
        type: "message",
        text: "Plan a gathering",
        version: prior.brief.version,
      },
      undefined,
      provider,
      model,
    );
    expect(result.status).toBe("error");
    expect(result.receipts?.at(-1)?.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain(privateKey);
    expect(result.brief.constraints.budget).toBe(60);
    expect(result.brief.selected).toEqual(prior.brief.selected);
    expect(result.artifacts).toEqual(prior.artifacts);
  });
  it("does not conflate two participants using the same name for different entity categories", async () => {
    const { store, provider } = setup();
    let task = store.load("t", "o");
    task.brief.goal = "Plan a gathering";
    task.brief.participants[0].preferences.push({
      id: "amara-artist-arrival",
      subject: "amara",
      value: "Arrival",
      entityType: "artist",
      polarity: "like",
      source: "user-supplied",
      confirmed: true,
      scope: "participant",
    });
    store.save(task, 0, "o");
    task = await runTurn(
      store,
      "t",
      "o",
      { type: "constraints", budget: 50, version: 0 },
      undefined,
      provider,
    );
    expect(task.status).toBe("clarification");
    expect(task.brief.unresolved.join()).toContain(
      "more than one cultural category",
    );
    expect(task.entities).toEqual([]);
    expect(provider.calls).toBe(0);
  });
  it("late model interpretation cannot overwrite a newer conversational correction", async () => {
    const { store, provider } = setup();
    let release!: (
      data: Awaited<ReturnType<DevelopmentModel["interpret"]>>,
    ) => void;
    const model: ModelProvider = {
      interpret: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    };
    const late = runTurn(
      store,
      "t",
      "o",
      { type: "message", text: "Plan a gathering", version: 0 },
      undefined,
      provider,
      model,
    );
    await runTurn(
      store,
      "t",
      "o",
      { type: "message", text: "Budget $1", version: 0 },
      undefined,
      provider,
    );
    release(await new DevelopmentModel().interpret("Plan a gathering"));
    await expect(late).rejects.toBeInstanceOf(ConflictError);
    expect(store.load("t", "o").brief.constraints.budget).toBe(1);
  });
});
