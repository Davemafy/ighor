import { describe, expect, it } from "vitest";
import { CandidateSchema } from "../../src/core/contracts";
import { freshTask } from "../../src/data/fixtures";
import {
  currentCandidates,
  sourceLabel,
  seedNames,
} from "../../src/components/discovery/model";

function reference() {
  return CandidateSchema.parse({
    ...freshTask("test", "owner").catalogue[0],
    eligibility: "needs-review",
    dependencies: [],
    freshness: "current",
    missing: [],
    violations: [],
    evidenceIds: [],
    fit: {},
    fitReason: "",
  });
}

describe("discovery presentation integrity", () => {
  it("does not fall back to unvalidated catalogue items when current candidates disappear", () => {
    const task = freshTask("test", "owner");
    task.candidates = [{ ...reference(), freshness: "stale" }];
    expect(currentCandidates(task)).toEqual([]);
  });

  it("keeps synthetic results labelled as examples even if a signal says LIVE", () => {
    const candidate = reference();
    candidate.sample = true;
    candidate.cultural = {
      test: {
        affinity: null,
        rank: 1,
        queryId: "test-only",
        seedIds: [],
        explanationEntities: [],
        delivery: "LIVE",
        retrievedAt: "2026-10-25",
      },
    };
    expect(sourceLabel(candidate)).toBe("EXAMPLE");
  });

  it("only displays resolved seed identities attached to the actual query", () => {
    const task = freshTask("test", "owner");
    task.entities = [
      {
        id: "seed",
        original: "Radiohead",
        name: "Radiohead",
        type: "artist",
        providerId: "seed-id",
        status: "resolved",
        metadata: "",
        choices: [],
      },
    ];
    const candidate = reference();
    candidate.cultural = {
      test: {
        affinity: null,
        rank: 1,
        queryId: "test-only",
        seedIds: ["another-id"],
        explanationEntities: [],
        delivery: "CACHED",
        retrievedAt: "2026-10-25",
      },
    };
    expect(seedNames(task, candidate)).toEqual([]);
    expect(sourceLabel({ ...candidate, sample: false })).toBe("CACHED");
  });
});
