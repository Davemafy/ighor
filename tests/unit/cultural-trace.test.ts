import { describe, expect, it } from "vitest";
import type { Task } from "../../src/core/contracts";
import { currentCulturalTraces } from "../../src/core/cultural-trace";

function sampleTask() {
  return {
    brief: {
      participants: [{ id: "a", name: "Alex" }],
      contextAnchor: undefined,
    },
    entities: [
      {
        status: "resolved",
        providerId: "seed-a",
        name: "Portishead",
      },
    ],
    evidence: [
      {
        id: "qloo:qloo-query:a:film-a",
        kind: "cultural",
        source: "provider-returned",
        delivery: "CACHED",
        freshness: "current",
        entityIds: ["film-a"],
      },
    ],
    candidates: [],
    catalogue: [
      {
        id: "film-a",
        providerId: "film-a",
        name: "An example film",
        type: "movie",
        sample: false,
        cultural: {
          a: {
            signalScope: "participant",
            rank: 2,
            affinity: 0.7,
            queryId: "qloo-query",
            seedIds: ["seed-a", "another-secret-seed"],
            explanationScope: "recommendation",
            explanationEntities: [
              { entity_id: "seed-a", score: 0.5 },
              { entity_id: "another-secret-seed", score: 0.2 },
            ],
            delivery: "CACHED",
            retrievedAt: "2026-10-20T12:00:00Z",
          },
        },
      },
    ],
  } as unknown as Task;
}

describe("read-only Qloo cultural attribution", () => {
  it("shows grounded seed names, within-query rank and source scope", () => {
    const traces = currentCulturalTraces(sampleTask());
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      candidateId: "film-a",
      name: "An example film",
      signals: [
        {
          audience: "Alex",
          scope: "participant",
          rank: 2,
          seeds: ["Portishead"],
          contributors: ["Portishead"],
          contributorScope: "recommendation",
          delivery: "CACHED",
        },
      ],
    });
    expect(JSON.stringify(traces)).not.toContain("another-secret-seed");
    expect(JSON.stringify(traces)).not.toContain("0.7");
  });

  it("keeps aggregate-query contribution scope distinct", () => {
    const task = sampleTask();
    task.catalogue[0].cultural!.a.explanationScope = "aggregate-query";
    const traces = currentCulturalTraces(task);
    expect(traces[0].signals[0].contributorScope).toBe("aggregate-query");
  });

  it("recognizes an anchor as context, never an inferred personal taste", () => {
    const task = sampleTask();
    task.brief.contextAnchor = {
      providerId: "seed-a",
      name: "Ghibli Museum",
      type: "place",
    };
    task.entities = [];
    task.evidence[0].id = "qloo:qloo-query:context:film-a";
    task.catalogue[0].cultural = {
      context: {
        ...task.catalogue[0].cultural!.a,
        signalScope: "context",
      },
    };
    const [trace] = currentCulturalTraces(task);
    expect(trace.signals[0]).toMatchObject({
      audience: "Cultural context",
      scope: "context",
      seeds: ["Ghibli Museum"],
    });
  });

  it("rejects a mismatched Qloo query even when the entity ID matches", () => {
    const task = sampleTask();
    task.evidence[0].id = "qloo:different-query:a:film-a";
    expect(currentCulturalTraces(task)).toEqual([]);
  });

  it("rejects fixture sources that impersonate Qloo evidence", () => {
    const task = sampleTask();
    task.evidence[0].source = "illustrative-example";
    expect(currentCulturalTraces(task)).toEqual([]);
    task.evidence[0].source = "recorded-fixture";
    expect(currentCulturalTraces(task)).toEqual([]);
    task.evidence[0].source = "user-supplied";
    expect(currentCulturalTraces(task)).toEqual([]);
  });

  it("requires delivery and entity membership to match the association", () => {
    const task = sampleTask();
    task.evidence[0].delivery = "LIVE";
    expect(currentCulturalTraces(task)).toEqual([]);
    task.evidence[0].delivery = "CACHED";
    task.evidence[0].entityIds = ["another-film"];
    expect(currentCulturalTraces(task)).toEqual([]);
  });

  it("excludes stale, missing-evidence and illustrative outputs", () => {
    const task = sampleTask();
    task.evidence[0].freshness = "stale";
    expect(currentCulturalTraces(task)).toEqual([]);
    task.evidence[0].freshness = "current";
    task.candidates = [
      {
        ...task.catalogue[0],
        freshness: "stale",
      },
    ] as Task["candidates"];
    expect(currentCulturalTraces(task)).toEqual([]);
    task.candidates = [];
    task.catalogue[0].sample = true;
    expect(currentCulturalTraces(task)).toEqual([]);
  });
});
