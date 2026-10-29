import type { Artifact, Task } from "./contracts";

/**
 * All copy on the invitation canvas originates from the saved workspace,
 * a plainly labelled placeholder, or an explicit user edit.
 * In particular a cultural suggestion is never represented as a booking,
 * guest RSVP, verified date, or verified event location.
 */
export type InvitationReference = {
  id: string;
  name: string;
  type: string;
  imageUrl: string | null;
  evidence: "LIVE" | "CACHED" | "ILLUSTRATIVE" | "UNVERIFIED";
};

export type InvitationScene = {
  artifact: Artifact | null;
  title: string;
  body: string;
  participantCount: number;
  sampleProfiles: boolean;
  locationSetting: string | null;
  budgetSetting: number;
  durationSetting: number;
  references: InvitationReference[];
  state: "not-written" | "current" | "needs-review";
};

export function readInvitationDraft(artifact: Artifact | null) {
  if (!artifact) {
    return { title: "Untitled gathering", body: "" };
  }

  const match = /^# ([^\n]{1,100})\n\n([\s\S]*)$/.exec(artifact.content);

  return match
    ? { title: match[1].trim(), body: match[2] }
    : { title: artifact.title, body: artifact.content };
}

export function composeInvitationDraft(title: string, body: string) {
  const normalizedTitle = title.trim().replace(/[\r\n]+/g, " ");
  const normalizedBody = body.trim();

  if (!normalizedTitle || normalizedTitle.length > 100) {
    throw new Error("Give this gathering a title under 100 characters.");
  }

  if (!normalizedBody) {
    throw new Error("Add a message before saving the invitation.");
  }

  const content = `# ${normalizedTitle}\n\n${normalizedBody}`;

  if (content.length > 10000) {
    throw new Error("The invitation must fit within 10,000 characters.");
  }

  return content;
}

export function projectInvitationScene(task: Task): InvitationScene | null {
  if (task.brief.kind !== "gathering" || !task.brief.goal.trim()) {
    return null;
  }

  const artifact =
    task.artifacts.find((item) => item.id === "invitation") ?? null;
  const draft = readInvitationDraft(artifact);

  const references: InvitationReference[] = task.candidates
    .filter(
      (candidate) =>
        candidate.freshness === "current" &&
        task.brief.selected.includes(candidate.id),
    )
    .slice(0, 6)
    .map((candidate) => {
      const culturalEvidence = task.evidence.find(
        (record) =>
          record.freshness === "current" &&
          record.kind === "cultural" &&
          record.source === "provider-returned" &&
          record.entityIds.includes(candidate.providerId ?? "") &&
          candidate.evidenceIds.includes(record.id),
      );
      const imageUrl =
        candidate.imageUrl &&
        /^https:\/\/images\.qloo\.com\//.test(candidate.imageUrl)
          ? candidate.imageUrl
          : null;

      return {
        id: candidate.id,
        name: candidate.name,
        type: candidate.type,
        imageUrl,
        evidence: culturalEvidence?.delivery
          ? culturalEvidence.delivery
          : candidate.sample
            ? "ILLUSTRATIVE"
            : "UNVERIFIED",
      };
    });

  const location = task.brief.constraints.location.trim();
  const hasExplicitLocation = location !== "At home" && location.length > 0;

  return {
    artifact,
    ...draft,
    participantCount: task.brief.participants.length,
    sampleProfiles: task.brief.participants.some((person) => person.sample),
    locationSetting: hasExplicitLocation ? location : null,
    budgetSetting: task.brief.constraints.budget,
    durationSetting: task.brief.constraints.duration,
    references,
    state: !artifact
      ? "not-written"
      : artifact.freshness === "current"
        ? "current"
        : "needs-review",
  };
}
