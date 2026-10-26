import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  capabilities,
  executeCapability,
  getCapability,
  type CapabilityContext,
} from "../../src/capabilities/registry";
import { defineCapability, ok } from "../../src/capabilities/contract";
import { planCapabilities } from "../../src/core/capability-plan";
import { validateEvidence } from "../../src/core/evidence";
import { invalidate } from "../../src/core/revision";
import { runTurn, ExecutionBudget } from "../../src/core/orchestrator";
import {
  FixtureCulturalProvider,
  SuppliedFactsProvider,
} from "../../src/tools/fixture-provider";
import { SqliteTaskStore } from "../../src/data/store";
import { freshTask, sampleCatalogue } from "../../src/data/fixtures";
import type { Task } from "../../src/core/contracts";

const stores: SqliteTaskStore[] = [];

afterEach(() => stores.splice(0).forEach((s) => s.close()));

function context(): CapabilityContext & { budget: ExecutionBudget } {
  return {
    cultural: new FixtureCulturalProvider(),
    facts: new SuppliedFactsProvider(),
    budget: new ExecutionBudget(),
    trace: () => {},
    now: () => new Date().toISOString(),
  };
}

function setup(kind: Task["brief"]["kind"] = "gathering") {
  const task = freshTask("cap-task", "owner");
  task.brief.kind = kind;

  if (kind === "creative") {
    task.brief.participants = task.brief.participants.slice(0, 1);
    task.catalogue = [
      {
        ...sampleCatalogue()[0],
        id: "reference-book",
        providerId: null,
        type: "book",
        name: "Supplied reflective reference",
        tags: ["reflective"],
        cost: { ...sampleCatalogue()[0].cost, value: 7 },
        duration: { ...sampleCatalogue()[0].duration, value: 12 },
      },
    ];
  }

  const store = new SqliteTaskStore(":memory:");
  stores.push(store);
  store.create(task);

  return { task, store };
}

async function complete(kind: Task["brief"]["kind"] = "gathering") {
  const { store } = setup(kind);
  const task = await runTurn(store, "cap-task", "owner", {
    type: "message",
    text:
      kind === "creative"
        ? "Create a creative brief for a reflective book-cover direction"
        : kind === "discovery"
          ? "Discover films and music from our tastes"
          : "Plan an evening gathering with film and music",
    version: 0,
  });

  return { task, store };
}

const actions = (task: Task, name: string) =>
  task.trace.filter((t) => t.action === name).length;

describe("typed capability contracts and closed registry", () => {
  it("registers exactly four capabilities with independently validated contracts", () => {
    expect(Object.keys(capabilities)).toEqual([
      "discover",
      "evaluate",
      "collaborate",
      "compose",
    ]);

    for (const c of Object.values(capabilities)) {
      expect(c.goals).toEqual(["gathering", "discovery", "creative"]);
      expect(c.input.safeParse({}).success).toBe(false);
    }

    expect(getCapability("fetch_url")).toBeNull();
  });
  it("returns an invalid-input result before invoking a provider", async () => {
    const ctx = context();
    const result = await executeCapability(
      capabilities.discover,
      { operation: "retrieve", catalogue: "invalid" },
      ctx,
    );
    expect(result.error?.code).toBe("invalid-input");
    expect(result.data).toBeNull();
    expect(ctx.budget.used).toBe(0);
  });
  it("rejects a malformed execution output at the output schema", async () => {
    const bad = defineCapability({
      id: "compose",
      goals: ["creative"],
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      execute: async () => ok({ text: 42 } as never),
    });
    const r = await executeCapability(
      bad,
      { text: "reference brief" },
      context(),
    );
    expect(r.error?.code).toBe("invalid-output");
    expect(r.data).toBeNull();
  });
  it("returns a safe structured failure for a thrown provider error", async () => {
    const ctx = context();

    ctx.cultural.resolve = async () => {
      throw new Error("Bearer a-private-secret");
    };

    const r = await executeCapability(
      capabilities.discover,
      { operation: "resolve", terms: ["Radiohead"], entities: [] },
      ctx,
    );
    expect(r.error?.code).toBe("execution-failed");
    expect(JSON.stringify(r)).not.toContain("a-private-secret");
    expect(r.retry).toBe("manual");
  });
  it("refuses unsupported goal plans and selects edit-only execution", () => {
    expect(
      planCapabilities({
        goal: "purchase-flight",
        mode: "refresh",
        discover: true,
        factsCurrent: false,
        participantCount: 6,
      }).status,
    ).toBe("blocked");
    const p = planCapabilities({
      goal: "creative",
      mode: "edit",
      discover: false,
      factsCurrent: true,
      participantCount: 1,
    });
    expect(p.actions).toEqual([{ capability: "compose", operation: "edit" }]);
  });
  it("asks for a supported goal rather than fabricating an arbitrary task", async () => {
    const { store } = setup();
    const t = await runTurn(store, "cap-task", "owner", {
      type: "message",
      text: "Book a flight and purchase the ticket",
      version: 0,
    });
    expect(t.status).toBe("clarification");
    expect(t.brief.goal).toBe("");
    expect(actions(t, "cultural.discover")).toBe(0);
    expect(t.artifacts).toEqual([]);
  });
});

describe("Discover boundary and shared evidence rules", () => {
  it("preserves ambiguous identities with no retrieval implied", async () => {
    const r = await executeCapability(
      capabilities.discover,
      { operation: "resolve", terms: ["Phoenix"], entities: [] },
      context(),
    );
    expect(r.status).toBe("ambiguous");
    expect(r.data?.entities[0].providerId).toBeNull();
    expect(r.data?.unresolved).toHaveLength(1);
  });
  it("retrieves typed film and book catalogues without changing the caller input", async () => {
    for (const kind of ["gathering", "creative"] as const) {
      const { task } = setup(kind);
      const ctx = context();
      const input = {
        operation: "retrieve",
        participants: task.brief.participants,
        catalogue: task.catalogue,
        location: task.brief.constraints.location,
        version: 1,
        mode: "none",
      };
      const snapshot = structuredClone(input);
      const r = await executeCapability(capabilities.discover, input, ctx);
      expect(r.status).toBe("ok");
      expect(r.data?.options.map((c) => c.type)).toContain(
        kind === "creative" ? "book" : "movie",
      );
      expect(
        r.data?.evidence.every(
          (e) => e.source === "illustrative-example" && e.explanation === null,
        ),
      ).toBe(true);
      expect(input).toEqual(snapshot);
    }
  });
  it("rejects candidates without attributable evidence", async () => {
    const ctx = context();
    const { task } = setup();
    ctx.cultural.discover = async () => ({
      status: "ok",
      data: { options: task.catalogue, evidence: [] },
      evidenceIds: [],
      warnings: [],
      retry: "never",
      requestCount: 0,
    });
    const r = await executeCapability(
      capabilities.discover,
      {
        operation: "retrieve",
        participants: task.brief.participants,
        catalogue: task.catalogue,
        location: "At home",
        version: 1,
        mode: "none",
      },
      ctx,
    );
    expect(r.error?.code).toBe("execution-failed");
  });
  it("rejects duplicate evidence and invented fixture explanations", async () => {
    const { task } = await complete();
    const e = task.evidence[0];
    expect(() => validateEvidence([e, e])).toThrow("Duplicate");
    expect(() =>
      validateEvidence([
        { ...e, explanation: "Provider says this is a perfect match" },
      ]),
    ).toThrow("Fixture");
    expect(() => validateEvidence([{ ...e, reference: "" }])).toThrow(
      "reference",
    );
  });
  it("handles empty and failed retrievals with explicit statuses and zero fixture requests", async () => {
    const { task } = setup();

    for (const mode of [
      "empty",
      "timeout",
      "auth",
      "rate-limit",
      "malformed",
    ]) {
      const r = await executeCapability(
        capabilities.discover,
        {
          operation: "retrieve",
          participants: task.brief.participants,
          catalogue: task.catalogue,
          location: "At home",
          version: 1,
          mode,
        },
        context(),
      );
      expect(["empty", "error", "blocked"]).toContain(r.status);
      expect(r.requestCount).toBe(0);
      expect(r.data?.options).toEqual([]);
    }
  });
});

describe("shared evaluation, collaboration and pure composition", () => {
  it("evaluates independently of preference scoring and preserves unknowns", async () => {
    const { task } = setup();
    const r = await executeCapability(
      capabilities.evaluate,
      {
        operation: "eligibility",
        options: task.catalogue,
        brief: task.brief,
        evidence: [],
        checkedOptions: [],
        refreshFacts: true,
      },
      context(),
    );
    expect(r.status).toBe("ok");
    expect(
      r.data?.candidates.every((c) => Object.keys(c.fit).length === 0),
    ).toBe(true);
    expect(
      r.data?.candidates.find((c) => c.id === "unknown")?.eligibility,
    ).toBe("needs-review");
  });
  it("keeps participant polarity and attribution in the standalone comparison", async () => {
    const { task } = await complete();
    const r = await executeCapability(
      capabilities.collaborate,
      { participants: task.brief.participants, candidates: task.candidates },
      context(),
    );
    expect(r.data?.disagreements).toContainEqual(
      expect.objectContaining({ participantId: "leo", candidateId: "quiet" }),
    );
    const p = structuredClone(task.brief.participants[0]);
    p.preferences = p.preferences.map((x) => ({ ...x, polarity: "not-now" }));
    const neutral = await executeCapability(
      capabilities.collaborate,
      { participants: [p], candidates: task.candidates },
      context(),
    );
    expect(neutral.data?.candidates.every((c) => c.fit[p.id] === 0)).toBe(true);
    p.preferences[0].subject = "somebody-else";
    expect(
      (
        await executeCapability(
          capabilities.collaborate,
          { participants: [p], candidates: task.candidates },
          context(),
        )
      ).error?.code,
    ).toBe("execution-failed");
  });
  it("rejects stale comparisons and stale composition inputs", async () => {
    const { task } = await complete();
    task.candidates[0].freshness = "stale";
    expect(
      (
        await executeCapability(
          capabilities.collaborate,
          {
            participants: task.brief.participants,
            candidates: task.candidates,
          },
          context(),
        )
      ).status,
    ).toBe("error");
    expect(
      (
        await executeCapability(
          capabilities.compose,
          {
            operation: "create",
            brief: task.brief,
            candidates: task.candidates,
            evidence: task.evidence,
            artifacts: task.artifacts,
          },
          context(),
        )
      ).status,
    ).toBe("error");
  });
  it("composes without mutating its validated input", async () => {
    const { task } = await complete("creative");
    const input = {
      operation: "create",
      brief: task.brief,
      candidates: task.candidates,
      evidence: task.evidence,
      artifacts: task.artifacts,
    };
    const original = structuredClone(input);
    const r = await executeCapability(capabilities.compose, input, context());
    expect(r.status).toBe("ok");
    expect(r.data?.artifacts[0].kind).toBe("creative-brief");
    expect(r.data?.schedule).toEqual([]);
    expect(input).toEqual(original);
  });
  it("rejects nonexistent selections, missing facts and fabricated evidence", async () => {
    const { task } = await complete();

    for (const fault of ["identity", "fact", "evidence"]) {
      const t = structuredClone(task);

      if (fault === "identity") {
        t.brief.selected.push("does-not-exist");
      }

      if (fault === "fact") {
        t.candidates.find((c) => c.id === t.brief.selected[0])!.cost.value =
          null;
      }

      if (fault === "evidence") {
        t.artifacts[0].evidenceIds.push("invented-source");
      }

      const r = await executeCapability(
        capabilities.evaluate,
        {
          operation: "integrity",
          brief: t.brief,
          candidates: t.candidates,
          evidence: t.evidence,
          artifacts: t.artifacts,
          schedule: t.schedule,
        },
        context(),
      );
      expect(r.status).toBe("error");
    }
  });
  it("does not accept a fabricated schedule that contradicts its selected durations", async () => {
    const { task } = await complete();
    task.schedule[1].minutes = 1;
    const r = await executeCapability(
      capabilities.evaluate,
      {
        operation: "integrity",
        brief: task.brief,
        candidates: task.candidates,
        evidence: task.evidence,
        artifacts: task.artifacts,
        schedule: task.schedule,
      },
      context(),
    );
    expect(r.status).toBe("error");
  });
  it("validates practical provider responses before they reach decisions", async () => {
    const { store } = setup();
    const facts = new SuppliedFactsProvider();
    facts.check = async () =>
      ({
        status: "ok",
        data: [{ bad: "fact" }],
        evidenceIds: [],
        warnings: [],
        retry: "never",
        requestCount: 0,
      }) as never;
    const t = await runTurn(
      store,
      "cap-task",
      "owner",
      { type: "sample", version: 0 },
      undefined,
      undefined,
      undefined,
      facts,
    );
    expect(t.status).toBe("error");
    expect(t.brief.selected).toEqual([]);
  });
});

describe("the same capabilities across materially different goals and revisions", () => {
  it("uses all four registered capabilities for a gathering and a book-based creative brief", async () => {
    const gathering = (await complete()).task;
    const creative = (await complete("creative")).task;

    for (const task of [gathering, creative]) {
      expect(task.status).toBe("ready");
      expect(task.trace.find((t) => t.action === "planner")?.outcome).toContain(
        "discover.retrieve",
      );
      expect(task.trace.find((t) => t.action === "planner")?.outcome).toContain(
        "evaluate.eligibility",
      );
      expect(actions(task, "collaborate")).toBe(1);
      expect(actions(task, "compose")).toBe(1);
    }

    expect(gathering.schedule.length).toBeGreaterThan(0);
    expect(gathering.artifacts[0].kind).toBe("programme");
    expect(creative.schedule).toEqual([]);
    expect(creative.brief.selected).toEqual(["reference-book"]);
    expect(creative.artifacts[0].kind).toBe("creative-brief");
    expect(creative.artifacts[1].content).not.toContain("listening session");
    expect(creative.artifacts[1].content).not.toContain("minutes at");
  });
  it("cannot use the book-reference strategy as a film programme", async () => {
    const { store } = setup("creative");
    const t = await runTurn(store, "cap-task", "owner", {
      type: "message",
      text: "Plan a film evening gathering",
      version: 0,
    });
    expect(t.status).toBe("partial");
    expect(t.brief.selected).toEqual([]);
    expect(t.schedule).toEqual([]);
  });
  it("reuses cultural and practical evidence when changing the output goal", async () => {
    const { task, store } = await complete();
    const ids = task.evidence.map((e) => e.id);
    const t = await runTurn(store, "cap-task", "owner", {
      type: "message",
      text: "Create a creative brief for a reflective direction",
      version: task.brief.version,
    });
    expect(t.status).toBe("ready");
    expect(t.artifacts[0].kind).toBe("creative-brief");
    expect(t.schedule).toEqual([]);
    expect(actions(t, "cultural.discover")).toBe(
      actions(task, "cultural.discover"),
    );
    expect(actions(t, "facts.check")).toBe(actions(task, "facts.check"));
    expect(t.evidence.map((e) => e.id)).toEqual(ids);
  });
  it.each(["gathering", "creative"] as const)(
    "targets budget, taste, location and draft revisions for %s",
    async (kind) => {
      const { task, store } = await complete(kind);
      let t = await runTurn(store, "cap-task", "owner", {
        type: "constraints",
        budget: 40,
        version: task.brief.version,
      });
      expect(actions(t, "cultural.discover")).toBe(
        actions(task, "cultural.discover"),
      );
      expect(actions(t, "facts.check")).toBe(actions(task, "facts.check"));
      const p = structuredClone(t.brief.participants[0]);
      p.preferences[0].value = "jazz";
      t = await runTurn(store, "cap-task", "owner", {
        type: "participant",
        participant: p,
        version: t.brief.version,
      });
      expect(actions(t, "cultural.discover")).toBe(
        actions(task, "cultural.discover") + 1,
      );
      expect(actions(t, "facts.check")).toBe(actions(task, "facts.check"));
      const before = t;
      t = await runTurn(store, "cap-task", "owner", {
        type: "artifact",
        artifactId: "invitation",
        content: "User-authored revision.",
        version: t.brief.version,
      });
      expect(t.trace.slice(before.trace.length).map((t) => t.action)).toEqual([
        "compose.edit",
      ]);
      expect(t.artifacts[0]).toEqual(before.artifacts[0]);
      t = await runTurn(store, "cap-task", "owner", {
        type: "constraints",
        location: "Different supplied location",
        version: t.brief.version,
      });
      expect(actions(t, "facts.check")).toBe(actions(task, "facts.check") + 1);
    },
  );
  it("propagates evidence invalidation regardless of record order and prior staleness", async () => {
    const { task } = await complete();
    const base = task.evidence[0];
    task.evidence = [
      { ...base, id: "dependent", dependencies: ["upstream"] },
      { ...base, id: "upstream", dependencies: ["taste-change"] },
    ];
    task.artifacts[0].dependencies = ["dependent"];
    task.artifacts[0].freshness = "stale";
    task.artifacts[1].dependencies = ["main"];
    const changed = invalidate(task, ["taste-change"]);
    expect(changed).toContain("dependent");
    expect(changed).toContain("invitation");
    expect(task.artifacts.every((a) => a.freshness === "stale")).toBe(true);
  });
  it("refreshes facts when retrieval introduces a different catalogue", async () => {
    const { task, store } = await complete("creative");
    const provider = new FixtureCulturalProvider();
    const original = provider.discover.bind(provider);
    provider.discover = async (input) =>
      original({
        ...input,
        catalogue: [
          {
            ...input.catalogue[0],
            id: "new-reference",
            providerId: null,
            name: "New supplied book",
          },
        ],
      });
    const p = structuredClone(task.brief.participants[0]);
    p.preferences[0].value = "jazz";
    const t = await runTurn(
      store,
      "cap-task",
      "owner",
      { type: "participant", participant: p, version: task.brief.version },
      undefined,
      provider,
    );
    expect(t.status).toBe("ready");
    expect(t.brief.selected).toEqual(["new-reference"]);
    expect(actions(t, "facts.check")).toBe(actions(task, "facts.check") + 1);
  });
  it("retains a creative goal when a conversational budget correction includes no new goal", async () => {
    const { task, store } = await complete("creative");
    const t = await runTurn(store, "cap-task", "owner", {
      type: "message",
      text: "Lower the budget to $20",
      version: task.brief.version,
    });
    expect(t.brief.kind).toBe("creative");
    expect(t.artifacts[0].kind).toBe("creative-brief");
    expect(actions(t, "cultural.discover")).toBe(
      actions(task, "cultural.discover"),
    );
  });
  it("clears an unsupported-goal question when a supported cached goal resumes", async () => {
    const { task, store } = await complete("creative");
    const unsupported = await runTurn(store, "cap-task", "owner", {
      type: "message",
      text: "Book a flight and purchase the ticket",
      version: task.brief.version,
    });
    expect(unsupported.brief.unresolved).not.toEqual([]);
    const resumed = await runTurn(store, "cap-task", "owner", {
      type: "message",
      text: "Create a creative brief for a reflective direction",
      version: unsupported.brief.version,
    });
    expect(resumed.status).toBe("ready");
    expect(resumed.brief.unresolved).toEqual([]);
    expect(actions(resumed, "cultural.discover")).toBe(
      actions(task, "cultural.discover"),
    );
  });
  it("caps combined reference time and rejects a forged multi-reference selection", async () => {
    const { task, store } = setup("creative");
    task.brief.constraints.duration = 30;
    task.catalogue = ["first", "second"].map((id) => ({
      ...task.catalogue[0],
      id,
      duration: { ...task.catalogue[0].duration, value: 20 },
    }));
    store.save(task, 0, "owner");
    const t = await runTurn(store, "cap-task", "owner", {
      type: "message",
      text: "Create a creative brief for a reflective book-cover direction",
      version: 0,
    });
    expect(t.status).toBe("ready");
    expect(t.candidates.every((c) => c.eligibility === "eligible")).toBe(true);
    expect(t.brief.selected).toHaveLength(1);
    t.brief.selected = ["first", "second"];
    const r = await executeCapability(
      capabilities.evaluate,
      {
        operation: "integrity",
        brief: t.brief,
        candidates: t.candidates,
        evidence: t.evidence,
        artifacts: t.artifacts,
        schedule: [],
      },
      context(),
    );
    expect(r.status).toBe("error");
  });
});

it("rechecks hard reference constraints rather than trusting a forged eligibility flag", async () => {
  const { task } = await complete("creative");
  task.candidates[0].duration.value = 500;
  task.candidates[0].eligibility = "eligible";
  const r = await executeCapability(
    capabilities.evaluate,
    {
      operation: "integrity",
      brief: task.brief,
      candidates: task.candidates,
      evidence: task.evidence,
      artifacts: task.artifacts,
      schedule: task.schedule,
    },
    context(),
  );
  expect(r.status).toBe("error");
});

it("does not compose cultural claims from practical evidence alone", async () => {
  const { task } = await complete("creative");
  const evidence = task.evidence.filter((e) => e.kind === "practical");
  task.candidates.forEach((c) => {
    c.evidenceIds = c.evidenceIds.filter((id) =>
      evidence.some((e) => e.id === id),
    );
  });
  const r = await executeCapability(
    capabilities.compose,
    {
      operation: "create",
      brief: task.brief,
      candidates: task.candidates,
      evidence,
      artifacts: [],
    },
    context(),
  );
  expect(r.status).toBe("error");
});
