import { describe, expect, it, vi } from "vitest";
import { freshTask, sampleCatalogue } from "../../src/data/fixtures";
import { applyWorkActions } from "../../src/core/connected-work";
import { critiqueExperience } from "../../src/core/experience-critique";
import { runUnifiedAgent } from "../../src/core/unified-agent";
import { SqliteTaskStore } from "../../src/data/store";
import { invalidate } from "../../src/core/revision";
import type { Task } from "../../src/core/contracts";
import type { WorkAction } from "../../src/core/work-contracts";

const at = "2026-10-29T00:00:00.000Z";
const evidenceId = "qloo:mock-query:context:mock-artist";

function context(): Task {
  const task = freshTask("experience", "owner");
  const candidate = {
    ...sampleCatalogue()[0],
    id: "artist",
    providerId: "mock-artist",
    name: "Mock returned artist",
    type: "artist" as const,
    sample: false,
    cultural: {
      context: {
        affinity: null,
        rank: 1,
        queryId: "mock-query",
        seedIds: ["mock-seed"],
        explanationEntities: [],
        signalScope: "context" as const,
        delivery: "LIVE" as const,
        retrievedAt: at,
      },
    },
  };
  task.catalogue = [candidate];
  task.entities = [
    {
      id: "seed",
      original: "Radiohead",
      name: "Radiohead",
      type: "artist",
      providerId: "mock-seed",
      status: "resolved",
      metadata: "Mock protocol fixture",
      choices: [],
    },
  ];
  task.candidates = [
    {
      ...candidate,
      eligibility: "needs-review",
      dependencies: ["budget"],
      freshness: "current",
      missing: [],
      violations: [],
      evidenceIds: [evidenceId],
      fit: {},
      fitReason: "Mocked provider relationship",
    },
  ];
  task.evidence = [
    {
      id: evidenceId,
      source: "provider-returned",
      kind: "cultural",
      delivery: "LIVE",
      at,
      reference: "Mocked Qloo transport",
      entityIds: ["mock-artist"],
      summary: "A mocked query relationship, not live verification.",
      limitations: ["Unit-test fixture"],
      explanation: null,
      dependencies: ["preferences:maya"],
      freshness: "current",
    },
  ];

  return task;
}

function decisions(): WorkAction[] {
  return [
    { kind: "goal", id: "concept", title: "Experience concept" },
    {
      kind: "decision",
      id: "audience",
      title: "Audience",
      value: "Six friends interested in independent art",
      domain: "audience",
      rationaleKind: "interpretation",
      rationale: "User-supplied brief",
      estimatedCost: 0,
      evidenceIds: [],
      dependencies: ["goal:concept"],
    },
    {
      kind: "decision",
      id: "music",
      title: "Music",
      value: "A listening sequence from the observed artist",
      domain: "music",
      rationaleKind: "cultural-evidence",
      candidateIds: ["artist"],
      rationale: "Use the actual mocked query evidence",
      estimatedCost: 0,
      evidenceIds: [evidenceId],
      dependencies: ["decision:audience"],
    },
    {
      kind: "decision",
      id: "food",
      title: "Food and drink",
      value: "Wine and small plates",
      domain: "food",
      rationaleKind: "interpretation",
      containsAlcohol: true,
      rationale: "Creative pairing; no Qloo cuisine claim",
      estimatedCost: 1800,
      evidenceIds: [],
      dependencies: ["decision:music", "budget", "restriction:alcohol-free"],
    },
    {
      kind: "decision",
      id: "space",
      title: "Space",
      value: "A small accessible room; access unverified",
      domain: "venue",
      rationaleKind: "interpretation",
      rationale: "Spatial proposal",
      estimatedCost: 400,
      evidenceIds: [],
      dependencies: ["decision:music", "budget"],
    },
    {
      kind: "document",
      id: "brief",
      title: "Editable experience brief",
      content: "A provisional concept with unknown practical details.",
      fulfills: ["proposal"],
      candidateIds: ["artist"],
      evidenceIds: [evidenceId],
      dependencies: ["decision:food", "decision:space"],
    },
  ];
}

describe("Experience graph within canonical connected work", () => {
  it("cuts the budget, removes alcohol and preserves unrelated approval and manual wording", () => {
    const task = context();
    applyWorkActions(task, [{ kind: "budget", amount: 3000 }], "Budget $3,000");
    applyWorkActions(task, decisions());
    applyWorkActions(
      task,
      [{ kind: "approve", id: "audience" }],
      "Approve audience",
    );
    applyWorkActions(
      task,
      [{ kind: "edit", id: "brief", content: "My exact opening line." }],
      "Edit brief: My exact opening line.",
    );
    const music = structuredClone(
      task.work!.decisions.find((d) => d.id === "music"),
    );
    const audience = structuredClone(
      task.work!.decisions.find((d) => d.id === "audience"),
    );
    const queries = structuredClone(task.evidence);
    const text = "Cut the budget in half and remove alcohol.";
    applyWorkActions(
      task,
      [
        { kind: "reduce-budget", percent: 50 },
        {
          kind: "restriction",
          name: "alcohol-free",
          enabled: true,
          sourceText: "remove alcohol",
        },
      ],
      text,
    );
    expect(task.work!.budget?.amount).toBe(1500);
    expect(task.work!.decisions.find((d) => d.id === "audience")).toEqual(
      audience,
    );
    expect(task.work!.decisions.find((d) => d.id === "music")).toEqual(music);
    expect(task.work!.documents[0]).toMatchObject({
      content: "My exact opening line.",
      edited: true,
      freshness: "stale",
    });
    expect(task.evidence).toEqual(queries);
    expect(task.work!.critique?.issues.map((i) => i.kind)).toEqual(
      expect.arrayContaining(["budget", "restriction"]),
    );
    expect(task.status).toBe("partial");
  });
  it("rejects an invented cultural-to-food inference and stale source bindings", () => {
    const task = context();
    applyWorkActions(task, decisions());
    const food = task.work!.decisions.find((d) => d.id === "food")!;
    food.rationaleKind = "cultural-evidence";
    food.candidateIds = ["artist"];
    food.evidenceIds = [evidenceId];
    expect(
      critiqueExperience(task).issues.some(
        (i) => i.kind === "source" && i.nodeIds.includes("food"),
      ),
    ).toBe(true);
    invalidate(task, ["preferences:maya"]);
    expect(task.work!.decisions.find((d) => d.id === "music")?.freshness).toBe(
      "stale",
    );
    expect(task.work!.documents[0].freshness).toBe("stale");
  });
  it("finds incompatible schedules but permits explicitly parallel activities", () => {
    const task = context();
    applyWorkActions(task, decisions());
    task.work!.decisions[0].schedule = { startMinute: 30, durationMinutes: 60 };
    task.work!.decisions[1].schedule = { startMinute: 60, durationMinutes: 60 };
    expect(
      critiqueExperience(task).issues.some((i) => i.kind === "schedule"),
    ).toBe(true);
    task.work!.decisions[1].schedule.exclusive = false;
    expect(
      critiqueExperience(task).issues.some((i) => i.kind === "schedule"),
    ).toBe(false);
  });
  it("maintains the budget invariant regardless of decision order", () => {
    for (let amount = 1; amount <= 100; amount++) {
      const task = context();
      applyWorkActions(task, [{ kind: "budget", amount }], `Budget $${amount}`);
      applyWorkActions(task, decisions());
      const first = critiqueExperience(task).issues.filter(
        (i) => i.kind === "budget",
      );
      task.work!.decisions.reverse();
      const reversed = critiqueExperience(task).issues.filter(
        (i) => i.kind === "budget",
      );
      expect(Boolean(first.length)).toBe(2200 > amount);
      expect(Boolean(reversed.length)).toBe(Boolean(first.length));
    }
  });

  for (const goal of [
    "Create a gathering for six friends. Budget $3,000. Save a proposal.",
    "Create a listening bar concept. Budget $3,000. Save a proposal.",
  ]) {
    it(`uses the existing bounded agent and store for ${goal}`, async () => {
      const task = context();
      task.messages = [{ role: "user", text: goal, at }];
      const store = new SqliteTaskStore(":memory:");
      store.create(task);
      let step = 0;
      const discover = vi.fn(async () => {
        throw Error("Current Qloo evidence must be reused");
      });

      try {
        const result = await runUnifiedAgent({
          task,
          store,
          owner: "owner",
          goal,
          requirements: {
            culturalDecision: true,
            culturalReferences: ["Radiohead"],
            deliverables: ["proposal"],
            experienceDomains: ["audience", "music", "food", "venue"],
            budget: { amount: 3000, sourceText: "Budget $3,000" },
          },
          model: {
            interpret: vi.fn(),
            chooseAgentAction: async () =>
              ++step === 1
                ? {
                    name: "experience.compose",
                    arguments: { actions: decisions() },
                  }
                : { name: "agent.finish", arguments: {} },
          },
          research: { research: vi.fn() },
          cultural: { discover, resolve: vi.fn() },
          trace: vi.fn(),
        });
        const saved = store.load(task.id, "owner");
        expect(result.status).toBe("ok");
        expect(saved.agentRun?.acceptance?.status).toBe("satisfied");
        expect(saved.work?.documents[0].content).toContain("provisional");
        expect(saved.agentRun?.outputArtifactIds).toEqual(["document:brief"]);
        expect(saved.artifacts).toHaveLength(0);
        expect(discover).not.toHaveBeenCalled();
        expect(
          saved.work?.critique?.issues.some((i) => i.kind === "unknown"),
        ).toBe(true);
      } finally {
        store.close();
      }
    });
  }
});
