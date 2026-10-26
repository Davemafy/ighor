import { readRecordingText } from "../../src/tools/recording-file";
import { afterEach, describe, expect, it } from "vitest";
import { RecordedQlooProvider } from "../../src/tools/recorded-qloo";
import { freshLiveTask } from "../../src/data/live-task";
import { runTurn } from "../../src/core/orchestrator";
import { SqliteTaskStore, ConflictError } from "../../src/data/store";
import { DevelopmentModel } from "../../src/tools/development-model";
import { assertArtifactIntegrity } from "../../src/capabilities/evaluate";
import { type Task, type Event } from "../../src/core/contracts";

const raw = JSON.parse(
  readRecordingText("tests/fixtures/qloo-cultural.json.gz"),
);

const stores: SqliteTaskStore[] = [];

afterEach(() => stores.splice(0).forEach((s) => s.close()));

function setup() {
  const store = new SqliteTaskStore(":memory:");
  stores.push(store);
  store.create(freshLiveTask("t", "o"));

  return { store, provider: new RecordedQlooProvider(raw) };
}

async function confirmed(
  store: SqliteTaskStore,
  provider: RecordedQlooProvider,
) {
  let task = await runTurn(
    store,
    "t",
    "o",
    { type: "sample", version: 0 },
    undefined,
    provider,
  );
  expect(task.status).toBe("clarification");
  const entity = task.entities.find((e) => e.original === "Moonlight")!;
  expect(entity.status).toBe("ambiguous");
  expect(entity.providerId).toBeNull();
  expect(entity.choices.map((c) => c.metadata).join(" ")).toContain("2016");
  task = await runTurn(
    store,
    "t",
    "o",
    {
      type: "resolve",
      entityId: entity.id,
      choiceId: "2955F3C4-36AB-49F3-A818-3597F35EF46C",
      version: task.brief.version,
    },
    undefined,
    provider,
  );

  return task;
}

function supplied(task: Task) {
  return task.catalogue.map((c, i) => ({
    ...c,
    cost: {
      ...c.cost,
      value: i === 0 ? 100 : 5,
      source: "user-supplied" as const,
      reference:
        "Explicit operator test assumption; not a verified market price",
    },
    duration: {
      ...c.duration,
      value: i === 1 ? 240 : c.type === "artist" ? 15 : 80,
      source: "user-supplied" as const,
      reference:
        "Operator-supplied test segment length; not a verified film runtime",
    },
    available: i === 2 ? null : true,
  }));
}

describe("Backend workflow over actual archived provider data — zero live calls in these tests", () => {
  it("resolves genuine ambiguity, preserves per-person affinities and all unknown practical facts", async () => {
    const { store, provider } = setup();
    const task = await confirmed(store, provider);
    expect(task.status).toBe("partial");
    expect(task.candidates).toHaveLength(30);
    expect(task.candidates.every((c) => c.eligibility === "needs-review")).toBe(
      true,
    );
    expect(
      task.candidates.every(
        (c) =>
          c.cost.value === null &&
          c.duration.value === null &&
          c.available === null,
      ),
    ).toBe(true);
    expect(
      new Set(task.candidates.flatMap((c) => Object.keys(c.cultural ?? {})))
        .size,
    ).toBe(6);
    expect(
      task.evidence
        .filter((e) => e.kind === "cultural")
        .every((e) => e.delivery === "CACHED"),
    ).toBe(true);
    expect(provider.calls).toBe(0);
    expect(task.trace.reduce((n, r) => n + r.requests, 0)).toBe(0);
    expect(
      task.evidence.some((e) => e.explanation?.includes("recommendation")),
    ).toBe(true);
  });
  it("produces a feasible programme and invitation after explicit facts; budget, taste, wording and location revisions stay honest", async () => {
    const { store, provider } = setup();
    let task = await confirmed(store, provider);
    task = await runTurn(
      store,
      "t",
      "o",
      {
        type: "catalogue",
        options: supplied(task),
        version: task.brief.version,
      },
      undefined,
      provider,
    );
    expect(task.status).toBe("ready");
    expect(task.brief.selected).toHaveLength(2);
    expect(
      task.candidates.filter((c) => c.eligibility === "ineligible").length,
    ).toBeGreaterThanOrEqual(2);
    expect(task.candidates.some((c) => c.eligibility === "needs-review")).toBe(
      true,
    );
    expect(
      task.schedule.reduce((n, s) => n + s.minutes, 0),
    ).toBeLessThanOrEqual(180);
    expect(() => assertArtifactIntegrity(task)).not.toThrow();
    const events: Event[] = [];
    task = await runTurn(
      store,
      "t",
      "o",
      { type: "constraints", budget: 1, version: task.brief.version },
      (e) => events.push(e),
      provider,
    );
    expect(
      events
        .find((e) => e.type === "state")!
        .task!.artifacts.every((a) => a.freshness === "stale"),
    ).toBe(true);
    expect(task.brief.selected).toEqual([]);
    task = await runTurn(
      store,
      "t",
      "o",
      { type: "constraints", budget: 60, version: task.brief.version },
      undefined,
      provider,
    );
    const before = task.trace.filter(
      (t) => t.action === "cultural.discover",
    ).length;
    task = await runTurn(
      store,
      "t",
      "o",
      {
        type: "artifact",
        artifactId: "invitation",
        content: "Join us for the programme; please confirm access.",
        version: task.brief.version,
      },
      undefined,
      provider,
    );
    expect(
      task.trace.filter((t) => t.action === "cultural.discover"),
    ).toHaveLength(before);
    const amara = structuredClone(task.brief.participants[0]);
    amara.preferences[0].value = "Kendrick Lamar";
    const oldSignal = task.candidates.map((c) => c.cultural?.amara?.seedIds[0]);
    task = await runTurn(
      store,
      "t",
      "o",
      { type: "participant", participant: amara, version: task.brief.version },
      undefined,
      provider,
    );
    expect(
      task.candidates.map((c) => c.cultural?.amara?.seedIds[0]),
    ).not.toEqual(oldSignal);
    expect(
      task.candidates
        .flatMap((c) =>
          c.cultural?.amara ? [c.cultural.amara.seedIds[0]] : [],
        )
        .every((id) => id === "C915A918-39C5-47A3-A101-D9FA1DECBD9C"),
    ).toBe(true);
    expect(provider.calls).toBe(0);
    task = await runTurn(
      store,
      "t",
      "o",
      {
        type: "constraints",
        location: "Different screening room",
        version: task.brief.version,
      },
      undefined,
      provider,
    );
    expect(task.brief.selected).toEqual([]);
    expect(task.status).toBe("partial");
    await expect(
      runTurn(
        store,
        "t",
        "o",
        { type: "constraints", budget: 10, version: 0 },
        undefined,
        provider,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("reuses the same cultural, evaluation and composition capabilities for discovery without a gathering schedule", async () => {
    const { store, provider } = setup();
    let task = await confirmed(store, provider);
    task = await runTurn(
      store,
      "t",
      "o",
      {
        type: "catalogue",
        options: supplied(task),
        version: task.brief.version,
      },
      undefined,
      provider,
    );
    task = await runTurn(
      store,
      "t",
      "o",
      {
        type: "message",
        text: "Discover films and artists for me",
        version: task.brief.version,
      },
      undefined,
      provider,
      new DevelopmentModel(),
    );
    expect(task.brief.kind).toBe("discovery");
    expect(task.status).toBe("ready");
    expect(task.schedule).toEqual([]);
    expect(task.artifacts[0].kind).toBe("comparison");
    expect(() => assertArtifactIntegrity(task)).not.toThrow();
    expect(provider.calls).toBe(0);
  });
  it("cache misses block instead of fabricating data, and malformed recordings are rejected", async () => {
    const p = new RecordedQlooProvider(raw);
    expect((await p.resolve("Unrecorded seed", "artist")).status).toBe(
      "blocked",
    );
    expect(p.calls).toBe(0);
    expect(
      () =>
        new RecordedQlooProvider({
          qloo_records: [
            { path: "https://evil.test", params: {}, status: "ok", at: "bad" },
          ],
        }),
    ).toThrow();
  });
});
