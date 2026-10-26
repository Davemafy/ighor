import { readRecordingText } from "../../src/tools/recording-file";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SqliteTaskStore } from "../../src/data/store";
import { freshLiveTask } from "../../src/data/live-task";
import { runTurn } from "../../src/core/orchestrator";
import { RecordedQlooProvider } from "../../src/tools/recorded-qloo";
import { DevelopmentModel } from "../../src/tools/development-model";
import {
  OutcomeSpecSchema,
  assertGroundedOutcome,
} from "../../src/core/outcome-spec";
import { assertArtifactIntegrity } from "../../src/capabilities/evaluate";
import { outcomeSnapshot } from "../../src/core/outcomes";
import { invalidate } from "../../src/core/revision";
import type { Task } from "../../src/core/contracts";

const records = JSON.parse(
  readRecordingText("tests/fixtures/qloo-cultural.json.gz"),
);

const stores: SqliteTaskStore[] = [];

afterEach(() => stores.splice(0).forEach((s) => s.close()));

function setup() {
  const store = new SqliteTaskStore(":memory:");
  stores.push(store);
  store.create(freshLiveTask("t", "o"));
  const provider = new RecordedQlooProvider(records);
  const discovery = vi.spyOn(provider, "discover");
  const turn = (t: Task, a: Record<string, unknown>) =>
    runTurn(
      store,
      "t",
      "o",
      { ...a, version: t.brief.version },
      undefined,
      provider,
      new DevelopmentModel(),
    );

  return {
    store,
    provider,
    discovery,
    turn,
    start: () =>
      runTurn(
        store,
        "t",
        "o",
        { type: "place-example", city: "Tokyo", version: 0 },
        undefined,
        provider,
      ),
  };
}

const main = (t: Task) => t.artifacts.find((a) => a.id === "main")!;

async function placesWithFacts() {
  const h = setup();
  let task = await h.start();
  const names = task.candidates.slice(0, 3).map((c) => c.name);

  for (const name of names) {
    task = await h.turn(task, {
      type: "message",
      text: `For ${name}: cost $5, duration 20 minutes, access confirmed.`,
    });
  }

  return { ...h, task };
}

describe("Broader evidence-linked outcomes through the actual orchestrator", () => {
  it("turns actual cached Tokyo references into a provisional three-day itinerary without inventing prices or opening hours", async () => {
    const h = setup();
    let t = await h.start();
    h.discovery.mockClear();
    t = await h.turn(t, {
      type: "message",
      text: "Build a 3-day itinerary in Tokyo.",
    });
    expect(t.status).toBe("partial");
    expect(main(t).kind).toBe("itinerary");
    expect(main(t).details).toMatchObject({
      days: 3,
      status: "provisional",
      segments: [],
      totalCost: 0,
    });
    expect(main(t).details?.references).toHaveLength(10);
    expect(t.brief.selected).toEqual([]);
    expect(h.discovery).not.toHaveBeenCalled();
    expect(h.provider.calls).toBe(0);
    assertArtifactIntegrity(t);
  });
  it("schedules only supplied feasible stops, counts transfer time, splits days and retains the same evidence", async () => {
    const h = await placesWithFacts();
    const ids = h.task.evidence.map((e) => e.id);
    h.discovery.mockClear();
    const t = await h.turn(h.task, {
      type: "outcome",
      outcome: { kind: "itinerary", days: 3, transferMinutes: 10 },
    });
    expect(t.status).toBe("ready");
    expect(main(t).details).toMatchObject({
      days: 3,
      totalCost: 15,
      totalMinutes: 70,
      status: "feasible-from-supplied-facts",
    });
    expect(main(t).details?.segments).toHaveLength(3);
    expect(main(t).details?.segments.map((s) => s.day)).toEqual([1, 1, 2]);
    expect(t.evidence.map((e) => e.id)).toEqual(ids);
    expect(h.discovery).not.toHaveBeenCalled();
    assertArtifactIntegrity(t);
  });
  it("does not fabricate routes when the transfer allowance is unknown", async () => {
    const h = await placesWithFacts();
    const t = await h.turn(h.task, {
      type: "outcome",
      outcome: { kind: "itinerary", days: 3, transferMinutes: null },
    });
    expect(main(t).details?.segments.map((s) => s.day)).toEqual([1, 2, 3]);
    expect(main(t).details?.status).toBe("provisional");
    assertArtifactIntegrity(t);
  });
  it("recalculates budget and transition corrections without cultural discovery; emits stale intermediate output", async () => {
    const h = await placesWithFacts();
    let t = await h.turn(h.task, {
      type: "outcome",
      outcome: { kind: "itinerary", days: 3, transferMinutes: 10 },
    });
    h.discovery.mockClear();
    const stages: Task[] = [];
    t = await runTurn(
      h.store,
      "t",
      "o",
      { type: "constraints", budget: 4, version: t.brief.version },
      (e) => {
        if (e.type === "state" && e.task) {
          stages.push(e.task);
        }
      },
      h.provider,
    );
    expect(stages.some((s) => main(s).freshness === "stale")).toBe(true);
    expect(t.brief.selected).toEqual([]);
    expect(main(t).details?.segments).toEqual([]);
    t = await h.turn(t, {
      type: "message",
      text: "Transfer allowance: 15 minutes.",
    });
    expect(t.brief.outcome).toEqual({
      kind: "itinerary",
      days: 3,
      transferMinutes: 15,
    });
    expect(t.brief.constraints.duration).toBe(180);
    expect(h.discovery).not.toHaveBeenCalled();
    assertArtifactIntegrity(t);
  });
  it("builds an artist-level listening programme; wording-only edits avoid discovery", async () => {
    const h = setup();
    let t = await h.turn(h.store.load("t", "o"), {
      type: "personal-profile",
      name: "You",
      artist: "Radiohead",
    });
    t = await h.turn(t, {
      type: "message",
      text: "Build a listening programme with 120 minutes and budget $20.",
    });
    expect(t.brief.outcome).toEqual({
      kind: "listening",
      transitionMinutes: 0,
    });
    expect(main(t).kind).toBe("listening-plan");
    const artists = t.candidates.filter((c) => c.type === "artist").slice(0, 2);

    for (const c of artists) {
      t = await h.turn(t, {
        type: "message",
        text: `For ${c.name}: cost $5, duration 30 minutes, access confirmed.`,
      });
    }

    expect(main(t).details?.segments).toHaveLength(2);
    h.discovery.mockClear();
    t = await h.turn(t, {
      type: "message",
      text: "Transition allowance: 5 minutes.",
    });
    expect(main(t).details?.totalMinutes).toBe(65);
    expect(t.brief.constraints.duration).toBe(120);
    t = await h.turn(t, {
      type: "artifact",
      artifactId: "main",
      content: "Our listening order — owner wording.",
    });
    expect(main(t).edited).toBe(true);
    expect(main(t).details?.totalMinutes).toBe(65);
    expect(h.discovery).not.toHaveBeenCalled();
    expect(main(t).details?.openQuestions.join(" ")).toContain("Tracks");
    assertArtifactIntegrity(t);
  });
  it("produces a research claim ledger with unknown facts and exports the same references, never treating them as activities", async () => {
    const h = setup();
    let t = await h.start();
    h.discovery.mockClear();
    t = await h.turn(t, {
      type: "message",
      text: "Create a cultural research report.",
    });
    expect(main(t).kind).toBe("research-report");
    expect(t.status).toBe("ready");
    expect(t.brief.selected).toEqual([]);
    expect(main(t).details?.claims).toHaveLength(10);
    expect(
      main(t).details?.references.every(
        (r) => r.eligibility === "needs-review",
      ),
    ).toBe(true);
    expect(main(t).details?.claims.every((c) => c.evidenceIds.length > 0)).toBe(
      true,
    );
    const snapshot = outcomeSnapshot(t, ["main"]);
    expect(snapshot.artifacts[0].details?.references).toHaveLength(10);
    expect(snapshot.options).toHaveLength(10);
    expect(JSON.stringify(snapshot)).not.toContain('"participants"');
    expect(h.discovery).not.toHaveBeenCalled();
    assertArtifactIntegrity(t);
  });
  it("composes a place-to-artist music direction with an explicit context boundary and no fabricated restaurant atmosphere", async () => {
    const h = setup();
    let t = await h.start();
    const c = t.candidates.find((c) => c.name === "Ghibli Museum")!;
    t = await h.turn(t, {
      type: "connection",
      candidateId: c.id,
      targetType: "artist",
    });
    h.discovery.mockClear();
    t = await h.turn(t, {
      type: "outcome",
      outcome: { kind: "music-direction" },
    });
    expect(main(t).kind).toBe("music-direction");
    expect(t.brief.contextAnchor?.name).toBe("Ghibli Museum");
    expect(main(t).details?.references).toHaveLength(10);
    expect(t.brief.selected).toEqual([]);
    expect(main(t).content).toContain("not personal affinity");
    expect(main(t).details?.openQuestions.join(" ")).toContain(
      "commercial playback rights",
    );
    expect(h.discovery).not.toHaveBeenCalled();
    assertArtifactIntegrity(t);
    t = await h.turn(t, {
      type: "message",
      text: "Develop a music direction from these artists.",
    });
    expect(t.brief.contextAnchor?.name).toBe("Ghibli Museum");
    expect(main(t).kind).toBe("music-direction");
    expect(h.discovery).not.toHaveBeenCalled();
  });
  it("honours a complete pinned programme or leaves it unscheduled", async () => {
    const h = await placesWithFacts();
    let t = await h.turn(h.task, {
      type: "outcome",
      outcome: { kind: "itinerary", days: 1, transferMinutes: 10 },
    });
    const names = t.candidates
      .filter((c) => c.eligibility === "eligible")
      .slice(0, 2)
      .map((c) => c.name);
    t = await h.turn(t, {
      type: "message",
      text: `Choose ${names.join(" and ")}.`,
    });
    expect(t.brief.selected).toHaveLength(2);
    t = await h.turn(t, { type: "constraints", budget: 5 });
    expect(t.brief.selected).toHaveLength(0);
    expect(main(t).details?.segments).toHaveLength(0);
  });
  it("asks for a resolved place instead of pretending restaurant atmosphere is Qloo evidence", async () => {
    const h = setup();
    let t = await h.start();
    h.discovery.mockClear();
    t = await h.turn(t, {
      type: "message",
      text: "What music fits my restaurant atmosphere?",
    });
    expect(t.status).toBe("clarification");
    expect(t.brief.unresolved.join(" ")).toContain("resolved place");
    expect(h.discovery).not.toHaveBeenCalled();
  });
  it("rejects stale task revisions and invalid outcome specifications", async () => {
    const h = setup();
    const t = await h.start();
    await h.turn(t, { type: "outcome", outcome: { kind: "research" } });
    await expect(
      h.turn(t, { type: "outcome", outcome: { kind: "research" } }),
    ).rejects.toThrow("newer correction");
    expect(
      OutcomeSpecSchema.safeParse({
        kind: "itinerary",
        days: 8,
        transferMinutes: 10,
      }).success,
    ).toBe(false);
    expect(
      OutcomeSpecSchema.safeParse({
        kind: "research",
        url: "https://evil.test",
      }).success,
    ).toBe(false);
  });
  it("location correction invalidates the linked itinerary and refuses to carry facts into the next city", async () => {
    const h = await placesWithFacts();
    let t = await h.turn(h.task, {
      type: "outcome",
      outcome: { kind: "itinerary", days: 2, transferMinutes: 10 },
    });
    const stale = structuredClone(t);
    expect(invalidate(stale, ["location"])).toContain("main");
    t = await h.turn(t, { type: "constraints", location: "Amsterdam" });
    expect(t.candidates.every((c) => c.cost.value === null)).toBe(true);
    expect(main(t).details?.segments).toEqual([]);
    expect(main(t).details?.references).toHaveLength(10);
  });
});

describe("Outcome integrity negative cases", () => {
  it("rejects fabricated claims, missing references and altered schedule totals", async () => {
    const h = await placesWithFacts();
    const t = await h.turn(h.task, {
      type: "outcome",
      outcome: { kind: "itinerary", days: 1, transferMinutes: 10 },
    });

    for (const mutate of [
      (x: Task) => {
        main(x).details!.totalMinutes++;
      },
      (x: Task) => {
        main(x).details!.segments[0].transferBefore = 5;
      },
      (x: Task) => {
        main(x).details!.references[0].candidateId = "fabricated";
      },
      (x: Task) => {
        main(x).details!.claims[0].evidenceIds = [];
      },
      (x: Task) => {
        main(x).details!.claims[0].evidenceIds = ["missing"];
      },
      (x: Task) => {
        x.candidates.find(
          (c) => c.id === main(x).details!.segments[0].candidateId,
        )!.cost.value = null;
      },
    ]) {
      const bad = structuredClone(t);
      mutate(bad);
      expect(() => assertArtifactIntegrity(bad)).toThrow();
    }
  });
  it("grounds model-extracted numeric allowances instead of accepting invented values", () => {
    expect(() =>
      assertGroundedOutcome(
        { kind: "itinerary", days: 3, transferMinutes: 5 },
        "An itinerary for 3 days.",
      ),
    ).toThrow("transfer");
    expect(() =>
      assertGroundedOutcome(
        { kind: "itinerary", days: 3, transferMinutes: 0 },
        "An itinerary for 3 days.",
      ),
    ).toThrow("Zero");
    expect(() =>
      assertGroundedOutcome(
        { kind: "listening", transitionMinutes: 5 },
        "A playlist.",
      ),
    ).toThrow("transition");
    expect(() =>
      assertGroundedOutcome(
        { kind: "itinerary", days: 3, transferMinutes: null },
        "A weekend itinerary.",
      ),
    ).toThrow("day count");
  });
  it("an invented model allowance asks for clarification before changing task facts", async () => {
    const h = setup();
    let t = await h.start();
    const duration = t.brief.constraints.duration;
    const previousStatus = t.status;
    t = await runTurn(
      h.store,
      "t",
      "o",
      {
        type: "message",
        text: "An itinerary in Tokyo.",
        version: t.brief.version,
      },
      undefined,
      h.provider,
      {
        interpret: async () => ({
          supported: true,
          intent: "goal",
          kind: "discovery",
          goal: "Itinerary",
          targetType: "place",
          outcome: { kind: "itinerary", days: 3, transferMinutes: 5 },
        }),
      },
    );
    expect(t.status).toBe(previousStatus);
    expect(t.error).toBeNull();
    expect(t.messages.at(-1)?.kind).toBe("conversation");
    expect(t.brief.outcome).toBeUndefined();
    expect(t.brief.constraints.duration).toBe(duration);
  });
});
