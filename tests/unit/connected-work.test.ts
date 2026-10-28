import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteTaskStore } from "../../src/data/store";
import { freshLiveTask } from "../../src/data/live-task";
import { freshTask } from "../../src/data/fixtures";
import { runTurn } from "../../src/core/orchestrator";
import { DevelopmentModel } from "../../src/tools/development-model";
import { GeminiModel } from "../../src/tools/gemini-model";
import type { TaskAction, Event } from "../../src/core/contracts";
import { EventSchema, TaskSchema } from "../../src/core/contracts";
import { composeOutcome } from "../../src/capabilities/outcome-composer";
import type {
  CulturalProvider,
  ModelProvider,
} from "../../src/tools/interfaces";
import { runtimeModelProvider } from "../../src/tools/runtime";

const stores: SqliteTaskStore[] = [];
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
  vi.unstubAllEnvs();
});
const scenario =
  "I want to launch a small listening bar for people into alternative music and independent art. Help me make it distinctive without overspending.";
const noCulture: CulturalProvider = {
  resolve: vi.fn(async () => {
    throw new Error("Unexpected Qloo call");
  }),
  discover: vi.fn(async () => {
    throw new Error("Unexpected Qloo call");
  }),
};

function setup(path = ":memory:") {
  const store = new SqliteTaskStore(path);
  stores.push(store);
  store.create(freshLiveTask("thread", "owner"));
  const events: Event[] = [];
  const turn = (
    action: TaskAction,
    model: ModelProvider = new DevelopmentModel(),
  ) =>
    runTurn(
      store,
      "thread",
      "owner",
      { ...action, version: store.load("thread", "owner").brief.version },
      (e) => events.push(e),
      noCulture,
      model,
    );
  const message = (text: string) => turn({ type: "message", text });

  return { store, events, turn, message };
}

describe("Connected work through the real orchestrator (scripted model, no live APIs)", () => {
  it("greeting and ordinary questions run without initializing cultural tools", async () => {
    const h = setup();
    const greeting = await h.message("hey");
    expect(greeting.messages.at(-1)?.text).toContain("Hey");
    const answer = await h.turn(
      { type: "message", text: "What is a closure?" },
      {
        interpret: async () => ({
          intent: "conversation",
          reply: "A closure retains access to variables in its lexical scope.",
        }),
      },
    );
    expect(answer.messages.at(-1)?.text).toContain("lexical scope");
    expect(answer.receipts!.every((r) => r.culturalRequests === 0)).toBe(true);
    expect(answer.messages.every((m) => !!m.id)).toBe(true);
  });
  it("builds connected deliverables with unknown costs and no cultural prerequisite", async () => {
    const h = setup();
    const t = await h.message(scenario);
    expect(t.work?.documents.length).toBe(8);
    expect(t.work?.decisions.every((d) => d.estimatedCost === null)).toBe(true);
    expect(t.work?.budget).toBeUndefined();
    expect(t.evidence).toEqual([]);
    expect(
      t.work?.documents.find((d) => d.id.endsWith("references"))?.content,
    ).toContain("No cultural evidence");
    expect(t.receipts?.at(-1)?.culturalRequests).toBe(0);
  });
  it("cuts confirmed budget 30%, keeps approvals, manual wording and unaffected revisions", async () => {
    const h = setup();
    await h.message(scenario);
    await h.message("Budget: 1000");
    await h.turn({
      type: "work",
      actions: [
        { kind: "approve", id: "listening-bar-identity" },
        {
          kind: "edit",
          id: "listening-bar-invite",
          content: "Our exact invitation wording.",
        },
        {
          kind: "edit",
          id: "listening-bar-atmosphere",
          content: "Keep our existing furniture and simple menu.",
        },
      ],
    });
    const before = h.store.load("thread", "owner");
    const concept = before.work!.documents.find(
      (d) => d.id === "listening-bar-concept",
    )!;
    const t = await h.message(
      "Cut the budget by 30%, keep the musical identity, and preserve everything I already approved.",
    );
    expect(t.work?.budget?.amount).toBe(700);
    expect(t.work?.budgetHistory.at(-1)?.amount).toBe(1000);
    expect(
      t.work?.decisions.find((d) => d.id === "listening-bar-identity"),
    ).toEqual(
      before.work!.decisions.find((d) => d.id === "listening-bar-identity"),
    );
    expect(t.work?.documents.find((d) => d.id === concept.id)).toEqual(concept);
    expect(
      t.work?.documents.find((d) => d.id === "listening-bar-invite")?.content,
    ).toBe("Our exact invitation wording.");
    expect(
      t.work?.documents.find((d) => d.id === "listening-bar-atmosphere"),
    ).toMatchObject({
      content: "Keep our existing furniture and simple menu.",
      freshness: "stale",
    });
    const allocation = t.work!.documents.find(
      (d) => d.id === "listening-bar-allocation",
    )!;
    expect(allocation.version).toBeGreaterThan(
      before.work!.documents.find((d) => d.id === allocation.id)!.version,
    );
    expect(allocation.content).toContain("$700");
    expect(allocation.history.length).toBeGreaterThan(0);
    expect(
      t.work?.decisions
        .filter((d) => d.status !== "approved")
        .reduce((sum, d) => sum + (d.estimatedCost ?? 0), 0),
    ).toBe(700);
    expect(t.receipts?.at(-1)?.culturalRequests).toBe(0);
    expect(h.store.load("thread", "owner").work).toEqual(t.work);
  });
  it("existing structured budget edits update connected work without cultural discovery", async () => {
    const h = setup();
    await h.message(scenario);
    await h.message("Budget: 1000");
    const t = await h.turn({ type: "constraints", budget: 700 });
    expect(t.work?.budget?.amount).toBe(700);
    expect(t.brief.constraints.budget).toBe(700);
    expect(
      t.work?.documents.find((d) => d.id === "listening-bar-allocation")
        ?.freshness,
    ).toBe("stale");
    expect(t.receipts?.at(-1)?.culturalRequests).toBe(0);
  });
  it("asks for a confirmed budget rather than reducing a starting default", async () => {
    const h = setup();
    await h.message(scenario);
    const t = await h.message("Cut the budget by 30%");
    expect(t.work?.budget).toBeUndefined();
    expect(t.messages.at(-1)?.text).toContain("starting budget");
  });
  it("retains infeasible approvals and reports their conflict", async () => {
    const h = setup();
    await h.message(scenario);
    await h.message("Budget: 1000");
    await h.turn({
      type: "work",
      actions: [{ kind: "approve", id: "listening-bar-format" }],
    });
    const t = await h.message("Cut the budget by 80%");
    expect(t.work?.budget?.amount).toBe(200);
    expect(
      t.work?.decisions.find((d) => d.id === "listening-bar-format"),
    ).toMatchObject({
      status: "approved",
      estimatedCost: 500,
      conflict: expect.stringContaining("exceed"),
    });
    expect(t.status).toBe("partial");
  });
  it("keeps earlier goals while revising the same technical report for beginners", async () => {
    const h = setup();
    await h.message(scenario);
    const original = h.store.load("thread", "owner").work!.documents;
    const first = await h.message(
      "Research three frontend frameworks and prepare a technical recommendation for my team.",
    );
    await h.turn({
      type: "work",
      actions: [{ kind: "approve", id: "framework-choice" }],
    });
    const t = await h.message(
      "Keep the recommendation, but change the audience to beginner developers and shorten the report.",
    );
    expect(t.work?.goals.length).toBe(2);
    expect(
      t.work?.documents.filter((d) => d.goalId === "listening-bar"),
    ).toEqual(original);
    const report = t.work!.documents.find((d) => d.id === "framework-report")!;
    expect(report.id).toBe(
      first.work!.documents.find((d) => d.id === "framework-report")!.id,
    );
    expect(report.history.at(-1)?.content).toContain("Compare React");
    expect(report.content).toContain("shortened for beginners");
    expect(
      t.work?.decisions.find((d) => d.id === "framework-choice")?.status,
    ).toBe("approved");
    expect(t.receipts!.every((r) => r.culturalRequests === 0)).toBe(true);
  });
  it("records blocked external actions without claiming execution", async () => {
    const h = setup();
    await h.message(scenario);
    const t = await h.message("Send the invitation");
    expect(t.work?.externalActions.at(-1)).toMatchObject({
      status: "blocked",
      reason: expect.stringContaining("Nothing was sent"),
    });
    expect(
      h.events.some(
        (e) => e.type === "action" && e.activity?.actionStatus === "blocked",
      ),
    ).toBe(true);
  });
  it("rejects missing evidence, cycles and invented approval atomically", async () => {
    const h = setup();
    await h.message(scenario);
    const before = h.store.load("thread", "owner").work;
    const t = await h.turn({
      type: "work",
      actions: [
        {
          kind: "document",
          id: "bad",
          title: "Unsupported",
          content: "Unverified",
          dependencies: ["document:bad"],
          evidenceIds: [],
        },
      ],
    });
    expect(t.work).toEqual(before);
    expect(t.messages.at(-1)?.text).toContain("Cyclic");
    const fabricated = await h.turn(
      { type: "message", text: "Tell me about this concept" },
      {
        interpret: async () => ({
          intent: "revision",
          kind: "creative",
          goal: "Keep work",
          workActions: [{ kind: "approve", id: "listening-bar-identity" }],
        }),
      },
    );
    expect(fabricated.work).toEqual(before);
    const noEvidence = await h.turn({
      type: "work",
      actions: [
        {
          kind: "document",
          id: "bad",
          title: "Unsupported",
          content: "Unverified",
          dependencies: [],
          evidenceIds: ["nonexistent"],
        },
      ],
    });
    expect(noEvidence.work).toEqual(before);
  });
  it("emits schema-valid revision events and stable messages and restores after reopen", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igor-work-"));

    try {
      const h = setup(join(dir, "state.sqlite"));
      const t = await h.message(scenario);
      h.events.forEach((e) => expect(() => EventSchema.parse(e)).not.toThrow());
      const packets = h.events
        .filter((e) => e.type === "action")
        .flatMap((e) => (e.activity ? [e.activity] : []));
      expect(packets.map((e) => e.sequence)).toEqual(packets.map((_, i) => i));
      expect(new Set(packets.map((e) => e.eventId)).size).toBe(packets.length);
      expect(
        h.events.some(
          (e) =>
            e.type === "action" &&
            e.activity?.kind === "artifact-created" &&
            e.activity.artifactId === "listening-bar-invite",
        ),
      ).toBe(true);
      const reopened = new SqliteTaskStore(join(dir, "state.sqlite"));
      stores.push(reopened);
      expect(reopened.load("thread", "owner")).toEqual(t);
    } finally {
      stores.splice(0).forEach((s) => s.close());
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("continues independent composition when a combined cultural lookup is blocked", async () => {
    const h = setup();
    const t = await h.turn(
      {
        type: "message",
        text: "I like Radiohead. Find music and prepare a launch note.",
      },
      {
        interpret: async () => ({
          intent: "goal",
          kind: "creative",
          goal: "Explore music and draft a launch note",
          targetType: "artist",
          actions: [
            {
              kind: "profile",
              participant: "you",
              preferences: [
                { value: "Radiohead", polarity: "like", entityType: "artist" },
              ],
            },
          ],
          workActions: [
            { kind: "goal", id: "launch-note", title: "Prepare launch note" },
            {
              kind: "document",
              id: "launch-note-draft",
              title: "Launch note",
              content:
                "Proposed launch note. Cultural references have not been established.",
              dependencies: ["goal:launch-note"],
              evidenceIds: [],
            },
          ],
        }),
      },
    );
    expect(t.work?.documents[0]?.id).toBe("launch-note-draft");
    expect(t.status).toBe("partial");
    expect(t.messages.at(-1)?.text).toContain("Cultural step remains");
  });
  it("handles configured model failure without replacing it with a scripted answer", async () => {
    const h = setup();
    const t = await h.turn(
      { type: "message", text: "hey" },
      {
        executionMode: "tool-calling",
        interpret: async () => {
          throw new Error("Provider unavailable");
        },
      },
    );
    expect(t.status).toBe("error");
    expect(t.messages.filter((m) => m.role === "assistant")).toHaveLength(0);
    expect(t.work).toBeUndefined();
  });
  it("does not silently choose a scripted model in an unconfigured production runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("IGOR_TEST_FIXTURES", "");
    vi.stubEnv("IGOR_QLOO_RECORDING", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "");
    await expect(
      runtimeModelProvider("qloo-live").interpret("hey"),
    ).rejects.toThrow("No production model");
  });
  it("accepts connected work from the production Gemini wire protocol", async () => {
    const h = setup();
    const transport = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const toolName = body.tools[0].functionDeclarations[0].name;
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: toolName,
                    args: toolName === "route_conversation" ? { intent: "delegate" } : {
                      decision: JSON.stringify({
                        intent: "goal",
                        kind: "creative",
                        goal: "Draft a note",
                        workActions: [
                          { kind: "goal", id: "note", title: "Draft a note" },
                          {
                            kind: "document",
                            id: "note-draft",
                            title: "A note",
                            content: "A proposed note for review.",
                            dependencies: ["goal:note"],
                            evidenceIds: [],
                          },
                        ],
                      }),
                    },
                  },
                },
              ],
            },
          },
        ],
      });
    });
    const t = await h.turn(
      { type: "message", text: "Draft a note" },
      new GeminiModel("test-key", "gemini-test", transport as typeof fetch),
    );
    expect(t.work?.documents[0].id).toBe("note-draft");
    expect(transport).toHaveBeenCalledTimes(2);
  });
});

describe("Regression defects", () => {
  it("switching to a sample keeps connected goals, messages and documents", async () => {
    const store = new SqliteTaskStore(":memory:");
    stores.push(store);
    store.create(freshTask("legacy", "owner"));
    const first = await runTurn(store, "legacy", "owner", {
      type: "message",
      text: scenario,
      version: 0,
    });
    const sample = await runTurn(store, "legacy", "owner", {
      type: "sample",
      version: first.brief.version,
    });
    expect(sample.work).toEqual(first.work);
    expect(sample.messages.slice(0, first.messages.length)).toEqual(
      first.messages,
    );
  });
  it("reads legacy overflow memories instead of hiding previously saved preferences", () => {
    const dir = mkdtempSync(join(tmpdir(), "igor-memory-"));
    const path = join(dir, "state.sqlite");
    const store = new SqliteTaskStore(path);
    const db = new DatabaseSync(path);

    try {
      for (let i = 0; i < 101; i++) {
        db.prepare("INSERT INTO memory VALUES(?,?,?)").run(
          "owner",
          `m${i}`,
          JSON.stringify({
            id: `m${i}`,
            subject: "you",
            value: `taste ${i}`,
            polarity: "like",
            source: "user-supplied",
            confirmed: true,
            scope: "persistent",
          }),
        );
      }

      expect(store.memory("owner")).toHaveLength(101);
      expect(store.memory("owner").at(-1)?.id).toBe("m100");
    } finally {
      db.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("preserves legacy documents and versions when the active output changes", async () => {
    const store = new SqliteTaskStore(":memory:");
    stores.push(store);
    store.create(freshTask("legacy", "owner"));
    const first = await runTurn(store, "legacy", "owner", {
      type: "sample",
      version: 0,
    });
    const second = await runTurn(store, "legacy", "owner", {
      type: "outcome",
      outcome: { kind: "research" },
      version: first.brief.version,
    });
    expect(second.artifacts.some((a) => a.id === "invitation")).toBe(true);
    expect(
      second.artifactHistory?.some((h) => h.artifact.kind === "programme"),
    ).toBe(true);
    expect(TaskSchema.parse(first).work).toBeUndefined();
    expect(store.load("legacy", "owner").artifacts).toEqual(second.artifacts);
  });
  it("does not attribute availability to an unselected unavailable reference", async () => {
    const store = new SqliteTaskStore(":memory:");
    stores.push(store);
    store.create(freshTask("legacy", "owner"));
    const task = await runTurn(store, "legacy", "owner", {
      type: "sample",
      version: 0,
    });
    task.brief.kind = "discovery";
    task.brief.outcome = { kind: "listening", transitionMinutes: 0 };
    const excluded = task.candidates.find((c) => c.id === "quiet")!;
    excluded.available = false;
    excluded.eligibility = "ineligible";
    const output = composeOutcome(task);
    expect(output.selected.length).toBeGreaterThan(0);
    expect(
      output.artifacts[0].details!.claims.some(
        (c) =>
          c.basis === "supplied-fact" && c.candidateIds.includes(excluded.id),
      ),
    ).toBe(false);
  });
  it("rejects memory 101, permits updates at capacity and reads exactly what was saved", () => {
    const store = new SqliteTaskStore(":memory:");
    stores.push(store);
    const task = freshTask("memory", "owner");
    store.create(task);
    const pref = (i: number) => ({
      id: `m${i}`,
      subject: "you",
      value: `taste ${i}`,
      polarity: "like" as const,
      source: "user-supplied" as const,
      confirmed: true,
      scope: "persistent" as const,
    });

    for (let i = 0; i < 100; i++) {
      const expected = task.brief.version++;
      store.save(task, expected, "owner", {
        operation: "save",
        preference: pref(i),
      });
    }

    const expected = task.brief.version++;
    expect(() =>
      store.save(task, expected, "owner", {
        operation: "save",
        preference: pref(100),
      }),
    ).toThrow("Memory limit");
    store.save(task, expected, "owner", {
      operation: "save",
      preference: { ...pref(99), value: "Updated taste" },
    });
    expect(store.memory("owner")).toHaveLength(100);
    expect(store.memory("owner").at(-1)?.value).toBe("Updated taste");
  });
});
