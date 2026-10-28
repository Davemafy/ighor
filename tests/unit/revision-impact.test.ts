import { describe, expect, it } from "vitest";
import type { Task } from "../../src/core/contracts";
import { readRevisionImpact } from "../../src/components/revision-impact-model";

function savedTask() {
  const oldDocument = {
    id: "proposal",
    title: "Brooklyn proposal",
    goalId: "gathering",
    content: "Direction: Radiohead with Sade and Wong Kar-wai. Budget: $3,000.",
    evidenceIds: ["qloo-1"],
    version: 1,
    history: [],
    status: "proposed",
    conflict: null,
    freshness: "current",
  };
  const current = {
    ...oldDocument,
    content: "Direction: Bad Bunny with Sade and Wong Kar-wai. Budget: $3,000.",
    version: 2,
    history: [
      { version: 1, content: oldDocument.content, at: "2026-10-28T00:00:00Z", reason: "saved" },
    ],
  };
  return {
    work: {
      budget: { amount: 3000, confirmed: true, currency: "USD" },
      documents: [
        current,
        { ...oldDocument, id: "access", title: "Access principle", status: "approved" },
      ],
      decisions: [],
    },
    brief: { constraints: { budget: 3000 } },
    evidence: [
      {
        id: "qloo-1",
        kind: "cultural",
        freshness: "current",
        delivery: "LIVE",
        source: "provider-returned",
      },
    ],
    agentRun: {
      requirements: { culturalReferences: ["Bad Bunny", "Sade", "Wong Kar-wai"] },
      acceptance: {
        checks: [
          { requirement: "Cultural revision grounded", status: "unknown" },
        ],
      },
    },
  } as unknown as Task;
}

describe("judge-facing persisted revision impact", () => {
  it("shows actual changed excerpts, the saved budget, approvals and unresolved acceptance", () => {
    const task = savedTask();
    const impact = readRevisionImpact(task, task.work!.documents[0]);
    expect(impact.changed).toBe(true);
    expect(impact.difference?.before).toContain("Radiohead");
    expect(impact.difference?.after).toContain("Bad Bunny");
    expect(impact.confirmedBudget).toBe(3000);
    expect(impact.approvedElsewhere).toEqual(["Access principle"]);
    expect(impact.retainedReferences).toEqual(["Sade", "Wong Kar-wai"]);
    expect(impact.unresolved).toContain("Cultural revision grounded (unknown)");
    expect(impact.cultural.live).toBe(1);
  });

  it("never invents preserved work or a successful revision when no history exists", () => {
    const task = savedTask();
    task.work!.documents = [task.work!.documents[0]];
    task.work!.documents[0].history = [];
    task.evidence = [];
    task.agentRun = undefined;
    const impact = readRevisionImpact(task, task.work!.documents[0]);
    expect(impact.changed).toBe(false);
    expect(impact.previousVersion).toBeNull();
    expect(impact.approvedElsewhere).toEqual([]);
    expect(impact.retainedReferences).toEqual([]);
    expect(impact.cultural.live).toBe(0);
  });

  it("flags disagreement between the saved brief and the confirmed budget", () => {
    const task = savedTask();
    task.brief.constraints.budget = 2500;
    const impact = readRevisionImpact(task, task.work!.documents[0]);
    expect(impact.unresolved).toContain("Saved work and brief do not agree on the budget.");
  });
});
