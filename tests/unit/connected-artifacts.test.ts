import { describe, expect, it } from "vitest";
import {
  reconcileGeneratedArtifact,
  hasLockedConflict,
  finalizeConnectedArtifacts,
} from "../../src/core/connected-artifacts";
import { SqliteTaskStore } from "../../src/data/store";
import { freshTask } from "../../src/data/fixtures";
import { runTurn } from "../../src/core/orchestrator";
import { compose } from "../../src/capabilities/compose";
import type { Artifact } from "../../src/core/contracts";

const original: Artifact = {
  id: "main",
  kind: "creative-brief",
  title: "Creative direction",
  content: "Reference-backed concept",
  version: 1,
  dependencies: ["goal", "selection"],
  evidenceIds: [],
  assumptions: [],
  freshness: "current",
  edited: false,
};

describe("connected artifact approvals", () => {
  it("preserves an unchanged current version instead of generating a duplicate", () => {
    expect(
      reconcileGeneratedArtifact({ ...original, version: 2 }, original),
    ).toEqual(original);
  });

  it("preserves approved content but flags a change as stale, not current", () => {
    const approved = { ...original, locked: true };
    const revised = reconcileGeneratedArtifact(
      { ...original, version: 2, content: "Changed direction" },
      approved,
    );
    expect(revised.content).toBe(original.content);
    expect(revised.version).toBe(1);
    expect(revised.freshness).toBe("stale");
    expect(hasLockedConflict([revised])).toBe(true);
  });

  it("does not silently reapprove an already invalidated artifact", () => {
    const approved = {
      ...original,
      freshness: "stale" as const,
      locked: true,
    };
    const result = reconcileGeneratedArtifact(
      { ...original, version: 2 },
      approved,
    );
    expect(result.freshness).toBe("stale");
    expect(result.locked).toBe(true);
  });

  it("approves and persists an artifact; refuses edits until unlocked", async () => {
    const store = new SqliteTaskStore(":memory:");
    try {
      const task = freshTask("connected", "owner");
      task.artifacts = [{ ...original }];
      store.create(task);
      let current = await runTurn(store, "connected", "owner", {
        type: "artifact-lock",
        artifactId: "main",
        locked: true,
        version: 0,
      });
      expect(current.artifacts[0].locked).toBe(true);
      expect(store.load("connected", "owner").artifacts[0].locked).toBe(true);

      await expect(
        runTurn(store, "connected", "owner", {
          type: "artifact",
          artifactId: "main",
          content: "Overwrite without consent",
          version: current.brief.version,
        }),
      ).rejects.toThrow("Unlock approved work");

      current = await runTurn(store, "connected", "owner", {
        type: "artifact-lock",
        artifactId: "main",
        locked: false,
        version: current.brief.version,
      });
      expect(current.artifacts[0].locked).toBe(false);
    } finally {
      store.close();
    }
  });

  it("refuses to approve a stale document", async () => {
    const store = new SqliteTaskStore(":memory:");
    try {
      const task = freshTask("stale", "owner");
      task.artifacts = [{ ...original, freshness: "stale" }];
      store.create(task);
      await expect(
        runTurn(store, "stale", "owner", {
          type: "artifact-lock",
          artifactId: "main",
          locked: true,
          version: 0,
        }),
      ).rejects.toThrow("Only current work");
    } finally {
      store.close();
    }
  });
  it("retains approved artifacts even when the new planner output omits them", () => {
    const lockedSound: Artifact = {
      ...original,
      id: "sound",
      kind: "music-direction",
      locked: true,
    };
    const result = finalizeConnectedArtifacts([{ ...original }], [lockedSound]);
    expect(result.map((a) => a.id)).toEqual(["main", "sound"]);
    expect(result[1].locked).toBe(true);
    expect(result[1].freshness).toBe("stale");
  });

  it("marks downstream artifacts stale if their approved input is invalidated", () => {
    const lockedSound: Artifact = {
      ...original,
      id: "sound",
      kind: "music-direction",
      freshness: "stale",
      locked: true,
    };
    const invitation: Artifact = {
      ...original,
      id: "invitation",
      kind: "invitation",
      dependencies: ["sound"],
    };
    const result = finalizeConnectedArtifacts(
      [lockedSound, invitation],
      [lockedSound],
    );
    expect(result.find((a) => a.id === "invitation")?.freshness).toBe("stale");
  });

  it("produces evidence-backed provisional creative direction without invented prices", async () => {
    const store = new SqliteTaskStore(":memory:");
    try {
      store.create(freshTask("provisional", "owner"));
      const task = await runTurn(store, "provisional", "owner", {
        type: "sample", version: 0,
      });
      task.brief.kind = "creative";
      task.brief.outcome = undefined;
      task.candidates = task.candidates.map((candidate) => ({
        ...candidate,
        eligibility: "needs-review" as const,
        cost: { ...candidate.cost, value: null },
      }));

      const output = compose({
        brief: task.brief,
        candidates: task.candidates,
        evidence: task.evidence,
        artifacts: [],
      });
      expect(output.status).toBe("partial");
      const sound = output.artifacts.find((artifact) => artifact.id === "sound");
      expect(sound).toBeDefined();
      expect(sound?.evidenceIds.length).toBeGreaterThan(0);
      expect(output.artifacts.find((artifact) => artifact.id === "main")?.content)
        .toContain("provisional");
      expect(sound?.content).toContain("licensing");
    } finally {
      store.close();
    }
  });

});
