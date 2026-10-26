import { expect, it } from "vitest";
import { freshTask } from "../../src/data/fixtures";
import { inspectResult } from "../../src/core/inspect-result";

it("keeps provenance intact and exposes stale or missing evidence without mutating the task", () => {
  const task = freshTask("inspection", "owner");
  task.evidence = [
    {
      id: "qloo",
      source: "provider-returned",
      delivery: "CACHED",
      at: "2026-10-25T00:00:00Z",
      reference: "query:1",
      entityIds: [],
      summary: "Cultural association",
      limitations: ["Does not establish availability"],
      explanation: null,
      dependencies: ["preferences:person"],
      freshness: "stale",
    },
  ];
  task.artifacts = [
    {
      id: "report",
      kind: "research-report",
      title: "References",
      content: "Draft",
      version: 1,
      dependencies: ["goal"],
      evidenceIds: ["qloo", "missing"],
      assumptions: ["Audience supplied by user"],
      freshness: "current",
      edited: false,
    },
  ];
  const before = structuredClone(task);
  const inspection = inspectResult(task, { kind: "artifact", id: "report" });
  expect(inspection?.freshness).toBe("stale");
  expect(inspection?.missingEvidenceIds).toEqual(["missing"]);
  expect(inspection?.evidence[0]).toMatchObject({
    source: "provider-returned",
    delivery: "CACHED",
    at: "2026-10-25T00:00:00Z",
  });
  inspection?.evidence[0].limitations.push("View-local change");
  expect(task).toEqual(before);
  expect(inspectResult(task, { kind: "candidate", id: "absent" })).toBeNull();
});
