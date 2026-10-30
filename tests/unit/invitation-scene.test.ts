import { describe, expect, it } from "vitest";
import type { Task } from "../../src/core/contracts";
import {
  composeInvitationDraft,
  projectInvitationScene,
  readInvitationDraft,
} from "../../src/core/invitation-scene";

function fixture(): Task {
  return {
    mode: "qloo-live",
    brief: {
      kind: "gathering",
      goal: "An evening for friends",
      participants: [
        { id: "one", name: "Ada", sample: true },
        { id: "two", name: "Ezra", sample: false },
      ],
      selected: ["candidate-1"],
      constraints: {
        location: "At home",
        budget: 60,
        duration: 180,
        currency: "USD",
      },
    },
    artifacts: [
      {
        id: "invitation",
        version: 2,
        title: "A note for everyone",
        content: "Come by for a thoughtful evening.",
        freshness: "current",
        locked: false,
      },
    ],
    candidates: [
      {
        id: "candidate-1",
        providerId: "returned-1",
        name: "A genuine recommendation",
        type: "movie",
        sample: false,
        imageUrl: "https://images.qloo.com/recommendation.jpg",
        freshness: "current",
        evidenceIds: ["qloo:q-1:one:returned-1"],
      },
    ],
    evidence: [
      {
        id: "qloo:q-1:one:returned-1",
        kind: "cultural",
        source: "provider-returned",
        delivery: "CACHED",
        entityIds: ["returned-1"],
        freshness: "current",
      },
    ],
  } as unknown as Task;
}

describe("grounded gathering invitation scene", () => {
  it("offers editable saved invitation copy without inventing a date or RSVP", () => {
    const model = projectInvitationScene(fixture())!;

    expect(model.title).toBe("A note for everyone");
    expect(model.body).toBe("Come by for a thoughtful evening.");
    expect(model.locationSetting).toBeNull();
    expect(model.state).toBe("current");
    expect(model.participantCount).toBe(2);
    expect(model.sampleProfiles).toBe(true);
    expect(JSON.stringify(model)).not.toMatch(
      /RSVP.*confirmed|guest.*accepted/i,
    );
  });

  it("distinguishes Qloo CACHED provenance from availability", () => {
    const model = projectInvitationScene(fixture())!;

    expect(model.references[0]).toMatchObject({
      name: "A genuine recommendation",
      imageUrl: "https://images.qloo.com/recommendation.jpg",
      evidence: "CACHED",
    });
  });

  it("never promotes a missing provider citation to verified Qloo", () => {
    const task = fixture();
    task.evidence = [];
    expect(projectInvitationScene(task)!.references[0].evidence).toBe(
      "UNVERIFIED",
    );
  });

  it("drops stale references and treats stale drafts as needing review", () => {
    const task = fixture();
    task.candidates[0].freshness = "stale";
    task.artifacts[0].freshness = "stale";

    expect(projectInvitationScene(task)!.references).toEqual([]);
    expect(projectInvitationScene(task)!.state).toBe("needs-review");
  });

  it("rejects non-Qloo image hosts without substituting stock", () => {
    const task = fixture();
    (task.candidates[0] as { imageUrl?: string | null }).imageUrl =
      "https://example.com/fake-event.jpg";

    expect(projectInvitationScene(task)!.references[0].imageUrl).toBeNull();
  });

  it("preserves the old invitation format and roundtrips authored title/body", () => {
    const task = fixture();
    const old = task.artifacts[0];

    expect(readInvitationDraft(old)).toEqual({
      title: "A note for everyone",
      body: "Come by for a thoughtful evening.",
    });

    const updated = composeInvitationDraft(
      "Friday with friends",
      "Bring something to share.",
    );
    expect(readInvitationDraft({ ...old, content: updated })).toEqual({
      title: "Friday with friends",
      body: "Bring something to share.",
    });
  });

  it("does not create an editable artifact or fake title from nothing", () => {
    const task = fixture();
    task.artifacts = [];
    const scene = projectInvitationScene(task)!;

    expect(scene.artifact).toBeNull();
    expect(scene.title).toBe("Untitled gathering");
    expect(scene.state).toBe("not-written");
  });

  it("does not put an event invite into research and discovery goals", () => {
    const task = fixture();
    task.brief.kind = "discovery";
    expect(projectInvitationScene(task)).toBeNull();
    task.brief.kind = "gathering";
    task.brief.goal = "";
    expect(projectInvitationScene(task)).toBeNull();
  });

  it("rejects empty or overlong drafted invitations before sending a turn", () => {
    expect(() => composeInvitationDraft(" ", "Hello")).toThrow();
    expect(() => composeInvitationDraft("Hello", " ")).toThrow();
    expect(() => composeInvitationDraft("x".repeat(101), "Hello")).toThrow();
    expect(() => composeInvitationDraft("Hello", "x".repeat(10001))).toThrow();
  });
});
