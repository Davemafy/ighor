import { afterEach, describe, expect, it } from "vitest";
import { SqliteTaskStore, ConflictError } from "../../src/data/store";
import { freshTask } from "../../src/data/fixtures";
import { runTurn, ExecutionBudget } from "../../src/core/orchestrator";
import { invalidate } from "../../src/core/revision";
import {
  TaskSchema,
  TurnSchema,
  type Task,
  type Event,
} from "../../src/core/contracts";
import { FixtureCulturalProvider } from "../../src/tools/fixture-provider";
import { assertArtifactIntegrity } from "../../src/capabilities/evaluate";
import { DevelopmentModel } from "../../src/tools/development-model";

const stores: SqliteTaskStore[] = [];

function setup() {
  const store = new SqliteTaskStore(":memory:");
  stores.push(store);
  const task = freshTask("test", "owner");
  store.create(task);

  return { store, task };
}

async function complete() {
  const { store } = setup();

  return {
    store,
    task: await runTurn(store, "test", "owner", { type: "sample", version: 0 }),
  };
}

const count = (t: Task) =>
  t.trace.filter((t) => t.action === "cultural.discover").length;

afterEach(() => stores.splice(0).forEach((s) => s.close()));

describe("full credential-free workflow", () => {
  it("completes a fresh gathering with six distinct profiles, feasible schedule and invitation", async () => {
    const { task } = await complete();
    expect(task.status).toBe("ready");
    expect(task.brief.participants).toHaveLength(6);
    expect(
      new Set(
        task.brief.participants.map((p) =>
          JSON.stringify(p.preferences.map((x) => x.value)),
        ),
      ).size,
    ).toBe(6);
    expect(
      task.schedule.reduce((s, x) => s + x.minutes, 0),
    ).toBeLessThanOrEqual(180);
    expect(task.artifacts.map((a) => a.kind)).toContain("invitation");
    expect(task.artifacts.every((a) => a.evidenceIds.length > 0)).toBe(true);
    expect(() => assertArtifactIntegrity(task)).not.toThrow();
    expect(task.trace.reduce((s, t) => s + t.requests, 0)).toBe(0);
  });
  it("retains unknown facts and excludes over-budget and over-time candidates", async () => {
    const { task } = await complete();
    expect(task.candidates.find((c) => c.id === "unknown")?.eligibility).toBe(
      "needs-review",
    );
    expect(
      task.candidates.find((c) => c.id === "unknown")?.cost.value,
    ).toBeNull();
    expect(task.candidates.find((c) => c.id === "premium")?.eligibility).toBe(
      "ineligible",
    );
    expect(task.candidates.find((c) => c.id === "long")?.eligibility).toBe(
      "ineligible",
    );
  });
  it("retains explicit disagreement and profile attribution", async () => {
    const { task } = await complete();
    const quiet = task.candidates.find((c) => c.id === "quiet")!;
    expect(quiet.fit.leo).toBeLessThan(0);
    expect(quiet.fit.amara).toBeGreaterThan(quiet.fit.leo);
    expect(
      task.brief.participants
        .find((p) => p.id === "leo")
        ?.preferences.some(
          (x) => x.value === "ambient" && x.polarity === "dislike",
        ),
    ).toBe(true);
  });
  it("supports discovery and creative goals through reusable capabilities", async () => {
    const { store } = setup();
    let t = await runTurn(store, "test", "owner", {
      type: "message",
      text: "Discover films from our tastes",
      version: 0,
    });
    expect(t.brief.kind).toBe("discovery");
    expect(t.artifacts[0].kind).toBe("comparison");
    t = await runTurn(store, "test", "owner", {
      type: "message",
      text: "Create a creative brief for a listening club",
      version: t.brief.version,
    });
    expect(t.artifacts[0].kind).toBe("creative-brief");
    expect(t.status).toBe("ready");
  });
});

describe("dependency-aware correction", () => {
  it("rechecks budget without discovery and shows stale intermediate artifacts", async () => {
    const { store, task } = await complete();
    const events: Event[] = [];
    const next = await runTurn(
      store,
      "test",
      "owner",
      { type: "constraints", budget: 10, version: task.brief.version },
      (e) => events.push(e),
    );
    expect(count(next)).toBe(count(task));
    expect(next.candidates.find((c) => c.id === "moonrise")?.eligibility).toBe(
      "ineligible",
    );
    expect(next.brief.selected).toEqual([]);
    expect(next.status).toBe("partial");
    expect(
      events
        .find((e) => e.type === "state")
        ?.task?.artifacts.every((a) => a.freshness === "stale"),
    ).toBe(true);
    expect(next.artifacts.every((a) => a.freshness === "current")).toBe(true);
  });
  it("refreshes taste-dependent evidence and outputs for the correct participant", async () => {
    const { store, task } = await complete();
    const p = structuredClone(task.brief.participants[0]);
    p.preferences = [
      {
        id: "a:new",
        subject: p.id,
        value: "horror",
        polarity: "like",
        confirmed: true,
        scope: "participant",
        source: "user-supplied",
      },
    ];
    const next = await runTurn(store, "test", "owner", {
      type: "participant",
      participant: p,
      version: task.brief.version,
    });
    expect(count(next)).toBe(count(task) + 1);
    expect(
      next.evidence.some(
        (e) =>
          e.id.startsWith("cultural:") &&
          e.id.endsWith(`v${task.brief.version + 1}`),
      ),
    ).toBe(true);
    expect(next.brief.participants[1]).toEqual(task.brief.participants[1]);
    expect(next.artifacts[0].version).toBe(task.artifacts[0].version + 1);
  });
  it("edits invitation without any cultural or practical tool calls", async () => {
    const { store, task } = await complete();
    const next = await runTurn(store, "test", "owner", {
      type: "artifact",
      artifactId: "invitation",
      content: "Bring your curiosity, not your laptop.",
      version: task.brief.version,
    });
    expect(count(next)).toBe(count(task));
    expect(next.trace.slice(task.trace.length).map((t) => t.action)).toEqual([
      "compose.edit",
    ]);
    expect(next.artifacts.find((a) => a.id === "main")).toEqual(
      task.artifacts.find((a) => a.id === "main"),
    );
    expect(
      next.artifacts.find((a) => a.id === "invitation")?.content,
    ).toContain("curiosity");
  });
  it("interprets bounded natural-language budget and wording corrections", async () => {
    const { store, task } = await complete();
    let t = await runTurn(store, "test", "owner", {
      type: "message",
      text: "Lower budget to $15",
      version: task.brief.version,
    });
    expect(t.brief.constraints.budget).toBe(15);
    expect(count(t)).toBe(count(task));
    t = await runTurn(store, "test", "owner", {
      type: "message",
      text: "Invitation: A quieter evening. Bring a friend.",
      version: t.brief.version,
    });
    expect(t.artifacts.find((a) => a.id === "invitation")?.content).toBe(
      "A quieter evening. Bring a friend.",
    );
    expect(count(t)).toBe(count(task));
  });
  it("invalidates location-bound facts; old availability is not carried to another place", async () => {
    const { store, task } = await complete();
    task.catalogue[0].location = "At home";
    task.brief.version++;
    store.save(task, task.brief.version - 1, "owner");
    const events: Event[] = [];
    const next = await runTurn(
      store,
      "test",
      "owner",
      {
        type: "constraints",
        location: "A different venue",
        version: task.brief.version,
      },
      (e) => events.push(e),
    );
    expect(
      events
        .find((e) => e.type === "state")
        ?.task?.evidence.filter((e) => e.id.startsWith("facts:"))
        .every((e) => e.freshness === "stale"),
    ).toBe(true);
    const c = next.candidates.find((c) => c.id === "moonrise");
    expect(c?.available).toBeNull();
    expect(c?.eligibility).toBe("needs-review");
  });
  it("traverses artifact dependencies without a graph service", async () => {
    const { task } = await complete();
    task.artifacts[1].dependencies = ["main"];
    const marked = invalidate(task, ["budget"]);
    expect(marked).toContain("main");
    expect(marked).toContain("invitation");
  });
  it("rejects participant attribution tampering", async () => {
    const { store, task } = await complete();
    const p = structuredClone(task.brief.participants[0]);
    p.preferences[0].subject = "leo";
    await expect(
      runTurn(store, "test", "owner", {
        type: "participant",
        participant: p,
        version: task.brief.version,
      }),
    ).rejects.toThrow("own subject");
  });
});

describe("recovery and validation", () => {
  for (const mode of [
    "empty",
    "timeout",
    "auth",
    "rate-limit",
    "malformed",
  ] as const) {
    it(`handles ${mode} honestly and recovers`, async () => {
      const { store, task } = await complete();
      const next = await runTurn(store, "test", "owner", {
        type: "simulation",
        mode,
        version: task.brief.version,
      });
      expect(next.status).toBe("partial");
      expect(next.error).toBeTruthy();
      expect(next.brief.selected).toEqual([]);
      expect(next.artifacts.every((a) => a.freshness === "stale")).toBe(true);
      const recovered = await runTurn(store, "test", "owner", {
        type: "simulation",
        mode: "none",
        version: next.brief.version,
      });
      expect(recovered.status).toBe("ready");
      expect(recovered.artifacts.every((a) => a.freshness === "current")).toBe(
        true,
      );
    });
  }

  it("rejects invalid actions and impossible schema inputs", () => {
    expect(() =>
      TurnSchema.parse({
        type: "run_url",
        url: "https://example.com",
        version: 0,
      }),
    ).toThrow();
    expect(() =>
      TurnSchema.parse({ type: "constraints", budget: -1, version: 0 }),
    ).toThrow();
    expect(() =>
      TurnSchema.parse({ type: "message", text: "", version: 0 }),
    ).toThrow();
  });
  it("bounds action execution and rejects unauthorized actions", () => {
    const b = new ExecutionBudget(1);
    b.take("resolve");
    expect(() => b.take("discover")).toThrow("budget");
    expect(() => new ExecutionBudget().take("shell")).toThrow("Unauthorized");
  });
  it("keeps unknown, not-now and dislike distinct", () => {
    const t = freshTask("t", "o");
    t.brief.participants[0].preferences[0].polarity = "not-now";
    expect(
      TaskSchema.parse(t).brief.participants[0].preferences[0].polarity,
    ).toBe("not-now");
  });
  it("rejects a fabricated evidence reference", async () => {
    const { task } = await complete();
    task.artifacts[0].evidenceIds.push("not-a-record");
    expect(() => assertArtifactIntegrity(task)).toThrow("missing");
  });
  it("rejects an unsafe provider response without claiming completion", async () => {
    const { store } = setup();
    const provider = new FixtureCulturalProvider();
    provider.discover = async () =>
      ({
        status: "ok",
        data: { options: [], evidence: [{ not: "evidence" }] },
        evidenceIds: [],
        warnings: [],
        retry: "never",
        requestCount: 0,
      }) as never;
    const t = await runTurn(
      store,
      "test",
      "owner",
      { type: "sample", version: 0 },
      () => {},
      provider,
    );
    expect(t.status).toBe("error");
  });
  it("persists explicitly approved preferences without discovery", async () => {
    const { store, task } = await complete();
    const id = task.brief.participants[0].preferences[0].id;
    let t = await runTurn(store, "test", "owner", {
      type: "memory",
      preferenceId: id,
      operation: "save",
      version: task.brief.version,
    });
    expect(t.preferences[0].scope).toBe("persistent");
    expect(count(t)).toBe(count(task));
    t = await runTurn(store, "test", "owner", {
      type: "memory",
      preferenceId: id,
      operation: "delete",
      version: t.brief.version,
    });
    expect(t.preferences).toEqual([]);
  });
  it("extracts constraints without executing arbitrary text", async () => {
    const m = new DevelopmentModel();
    expect(await m.interpret("Gather for 2 hours, budget $40")).toMatchObject({
      budget: 40,
      duration: 120,
    });
    expect(await m.interpret("fetch https://example.com")).not.toHaveProperty(
      "url",
    );
  });
});

describe("ownership and concurrency", () => {
  it("enforces task ownership for read and write", () => {
    const { store, task } = setup();
    expect(() => store.load("test", "stranger")).toThrow("not found");
    expect(() => store.save(task, 0, "stranger")).toThrow("not found");
  });
  it("rejects outdated versions", async () => {
    const { store, task } = await complete();
    await expect(
      runTurn(store, "test", "owner", {
        type: "constraints",
        budget: 12,
        version: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(store.load("test", "owner").brief.version).toBe(task.brief.version);
  });
  it("a late tool result cannot overwrite a newer correction", async () => {
    const { store, task } = await complete();
    const provider = new FixtureCulturalProvider();
    const original = provider.discover.bind(provider);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });

    provider.discover = async (input) => {
      started();
      await gate;

      return original(input);
    };

    const slow = runTurn(
      store,
      "test",
      "owner",
      { type: "simulation", mode: "none", version: task.brief.version },
      () => {},
      provider,
    );
    await entered;
    const staged = store.load("test", "owner");
    const fast = await runTurn(store, "test", "owner", {
      type: "constraints",
      budget: 7,
      version: staged.brief.version,
    });
    release();
    await expect(slow).rejects.toBeInstanceOf(ConflictError);
    expect(store.load("test", "owner").brief.constraints.budget).toBe(7);
    expect(store.load("test", "owner").brief.version).toBe(fast.brief.version);
  });
});

describe("provenance and identity safeguards", () => {
  it("pauses on ambiguity, then resumes after an explicit identity choice", async () => {
    const { store, task } = await complete();
    const p = structuredClone(task.brief.participants[0]);
    p.preferences[0].value = "Phoenix";
    let t = await runTurn(store, "test", "owner", {
      type: "participant",
      participant: p,
      version: task.brief.version,
    });
    expect(t.status).toBe("clarification");
    expect(count(t)).toBe(count(task));
    expect(t.artifacts.every((a) => a.freshness === "stale")).toBe(true);
    const entity = t.entities.find((e) => e.original === "Phoenix")!;
    expect(entity.providerId).toBeNull();
    t = await runTurn(store, "test", "owner", {
      type: "resolve",
      entityId: entity.id,
      choiceId: entity.choices[0].id,
      version: t.brief.version,
    });
    expect(t.status).toBe("ready");
    expect(t.entities.find((e) => e.original === "Phoenix")?.providerId).toBe(
      "fixture:phoenix-band",
    );
  });
  it("never promotes a user replacement into externally verified facts", async () => {
    const { store, task } = await complete();
    const options = structuredClone(task.catalogue);
    options[0].cost.source = "verified-external";
    let t = await runTurn(store, "test", "owner", {
      type: "catalogue",
      options,
      version: task.brief.version,
    });
    expect(t.catalogue[0].cost.source).toBe("user-supplied");
    const p = structuredClone(t.brief.participants[0]);
    p.sample = true;
    p.preferences[0].source = "provider-returned";
    t = await runTurn(store, "test", "owner", {
      type: "participant",
      participant: p,
      version: t.brief.version,
    });
    expect(t.brief.participants[0].sample).toBe(false);
    expect(
      t.brief.participants[0].preferences.every(
        (x) => x.source === "user-supplied",
      ),
    ).toBe(true);
  });
  it("editing a stale invitation does not make its stale evidence current", async () => {
    const { store, task } = await complete();
    let t = await runTurn(store, "test", "owner", {
      type: "simulation",
      mode: "timeout",
      version: task.brief.version,
    });
    t = await runTurn(store, "test", "owner", {
      type: "artifact",
      artifactId: "invitation",
      content: "An edit while waiting for recovery.",
      version: t.brief.version,
    });
    expect(t.artifacts.find((a) => a.id === "invitation")?.freshness).toBe(
      "stale",
    );
    expect(t.status).toBe("partial");
    expect(count(t)).toBe(count(task) + 1);
  });
  it("fails safely when entity resolution returns an invalid identity", async () => {
    const { store } = setup();
    const provider = new FixtureCulturalProvider();
    provider.resolve = async () =>
      ({
        status: "ok",
        data: { bad: true },
        evidenceIds: [],
        warnings: [],
        retry: "never",
        requestCount: 0,
      }) as never;
    const t = await runTurn(
      store,
      "test",
      "owner",
      { type: "sample", version: 0 },
      undefined,
      provider,
    );
    expect(t.status).toBe("error");
    expect(t.entities).toEqual([]);
    expect(t.brief.selected).toEqual([]);
  });
});

it("a full brief form with an unchanged location preserves cultural discovery", async () => {
  const { store, task } = await complete();
  const t = await runTurn(store, "test", "owner", {
    type: "constraints",
    ...task.brief.constraints,
    budget: 10,
    version: task.brief.version,
  });
  expect(count(t)).toBe(count(task));
  expect(t.brief.selected).toEqual([]);
});

it("tracks candidate decisions as explicit revision dependencies", async () => {
  const { task } = await complete();
  const affected = invalidate(task, ["budget"]);
  expect(affected).toContain("candidate:moonrise");
  expect(task.candidates.every((c) => c.freshness === "stale")).toBe(true);
  expect(task.artifacts[0].freshness).toBe("stale");
});

it("redacts provider credential strings from errors, events and traces", async () => {
  const { store } = setup();
  const p = new FixtureCulturalProvider();
  p.discover = async () => ({
    status: "error",
    data: { options: [], evidence: [] },
    evidenceIds: [],
    warnings: ["Authorization Bearer private123"],
    retry: "never",
    requestCount: 0,
  });
  const events: Event[] = [];
  const task = await runTurn(
    store,
    "test",
    "owner",
    { type: "sample", version: 0 },
    (e) => events.push(e),
    p,
  );
  expect(JSON.stringify({ task, events })).not.toContain("private123");
  expect(task.error).toContain("[redacted]");
});

it("does not impose gathering overhead on a cultural discovery goal", async () => {
  const { store } = setup();
  const t = await runTurn(store, "test", "owner", {
    type: "message",
    text: "Discover films to watch within 120 minutes",
    version: 0,
  });
  expect(t.brief.kind).toBe("discovery");
  expect(t.candidates.find((c) => c.id === "arrival")?.eligibility).toBe(
    "eligible",
  );
});

it("preserves provider-neutral candidate identity across evidence and decisions", async () => {
  const { store, task } = await complete();
  const options = structuredClone(task.catalogue);
  options[0].providerId = "test-provider:entity-123";
  const t = await runTurn(store, "test", "owner", {
    type: "catalogue",
    options,
    version: task.brief.version,
  });
  const c = t.candidates.find((c) => c.id === "moonrise")!;
  expect(c.providerId).toBe("test-provider:entity-123");
  expect(c.evidenceIds.length).toBe(2);
  expect(
    t.evidence
      .filter((e) => c.evidenceIds.includes(e.id))
      .every((e) => e.entityIds.includes(c.providerId!)),
  ).toBe(true);
});

it("honors an explicit Edit main instruction and persists only supplied wording", async () => {
  const { store, task } = await complete();
  const content =
    "A quiet opening, followed by a discussion. Owner-authored direction.";
  const result = await runTurn(
    store,
    task.id,
    "owner",
    {
      type: "message",
      text: `Edit main: ${content}`,
      version: task.brief.version,
    },
    undefined,
    undefined,
    new DevelopmentModel(),
  );
  expect(result.artifacts.find((a) => a.id === "main")?.content).toBe(content);
  expect(
    store.load(task.id, "owner").artifacts.find((a) => a.id === "main")
      ?.content,
  ).toBe(content);
  expect(result.brief.constraints.budget).toBe(task.brief.constraints.budget);
});
