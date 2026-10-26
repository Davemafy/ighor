import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes, randomUUID, randomInt } from "node:crypto";
import { z } from "zod";
import { CandidateSchema, EvidenceSchema, type Task } from "../core/contracts";
import {
  SnapshotSchema,
  ReviewInputSchema,
  outcomeSnapshot,
  type ReviewInput,
} from "../core/outcomes";
import { AccessError, ConflictError } from "./store";

const CollectionSchema = z.object({
  notes: z.string().max(3000).default(""),
  revision: z.number().int().positive().default(1),
  id: z.string(),
  title: z.string(),
  taskId: z.string(),
  sourceVersion: z.number(),
  at: z.string(),
  items: CandidateSchema.array(),
  evidence: EvidenceSchema.array(),
});

const ShareSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  participantId: z.string().nullable(),
  snapshot: SnapshotSchema,
  expiresAt: z.string(),
  revoked: z.boolean(),
});

const ReviewSchema = z.object({
  id: z.string(),
  shareId: z.string(),
  participantId: z.string().nullable(),
  taskId: z.string(),
  at: z.string(),
  proposal: ReviewInputSchema,
  accepted: z.boolean(),
});

const AssessmentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  sourceVersion: z.number(),
  at: z.string(),
  A: z.array(z.string()),
  B: z.array(z.string()),
  aIsBaseline: z.boolean(),
  response: z
    .object({
      choice: z.enum(["A", "B", "no-preference", "insufficient-evidence"]),
      reason: z.string(),
      at: z.string(),
    })
    .nullable(),
});

export type StoredReview = z.infer<typeof ReviewSchema>;
export type StoredCollection = z.infer<typeof CollectionSchema>;
export type StoredShare = z.infer<typeof ShareSchema>;
export type StoredAssessment = z.infer<typeof AssessmentSchema>;

export class OutcomeStore {
  private db: DatabaseSync;

  constructor(
    path: string,
    private now = () => new Date(),
  ) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.db = new DatabaseSync(path);
    this.db.exec(
      `PRAGMA busy_timeout=5000;
       PRAGMA journal_mode=WAL;

       CREATE TABLE IF NOT EXISTS outcomes (
         id TEXT PRIMARY KEY,
         owner TEXT NOT NULL,
         kind TEXT NOT NULL,
         task TEXT NOT NULL,
         state TEXT NOT NULL
       );

       CREATE TABLE IF NOT EXISTS review_tokens (
         hash TEXT PRIMARY KEY,
         share TEXT NOT NULL
       );`,
    );
  }

  private put(
    id: string,
    owner: string,
    kind: string,
    task: string,
    state: unknown,
  ) {
    this.db
      .prepare(
        `INSERT INTO outcomes
       VALUES(?,?,?,?,?)
       ON CONFLICT(id)
       DO UPDATE SET state=excluded.state
       WHERE outcomes.owner=excluded.owner
       AND outcomes.kind=excluded.kind`,
      )
      .run(id, owner, kind, task, JSON.stringify(state));
  }

  private get(id: string, owner: string, kind: string) {
    const row = this.db
      .prepare("SELECT state FROM outcomes WHERE id=? AND owner=? AND kind=?")
      .get(id, owner, kind);

    if (!row) {
      throw new AccessError("Record not found.");
    }

    return JSON.parse(String(row.state));
  }

  private list(owner: string, kind: string, task?: string) {
    return (
      task
        ? this.db
            .prepare(
              "SELECT state FROM outcomes WHERE owner=? AND kind=? AND task=? ORDER BY rowid DESC LIMIT 100",
            )
            .all(owner, kind, task)
        : this.db
            .prepare(
              "SELECT state FROM outcomes WHERE owner=? AND kind=? ORDER BY rowid DESC LIMIT 100",
            )
            .all(owner, kind)
    ).map((r) => JSON.parse(String(r.state)));
  }

  collections(owner: string) {
    return this.list(owner, "collection").map((c) => CollectionSchema.parse(c));
  }

  collect(task: Task, title: string, ids: string[]) {
    if (this.collections(task.brief.owner).length >= 100) {
      throw new Error("Collection limit reached.");
    }

    if (!ids.length || new Set(ids).size !== ids.length) {
      throw new Error("Choose distinct current candidates.");
    }

    const items = ids.map((id) => {
      const candidate = task.candidates.find((option) => option.id === id);

      if (!candidate || candidate.freshness !== "current") {
        throw new Error("Current candidates required.");
      }

      return candidate;
    });

    const evidenceIds = new Set(
      items.flatMap((candidate) => candidate.evidenceIds),
    );
    const data = CollectionSchema.parse({
      id: randomUUID(),
      title,
      taskId: task.id,
      sourceVersion: task.brief.version,
      at: this.now().toISOString(),
      items,
      evidence: task.evidence.filter((evidence) =>
        evidenceIds.has(evidence.id),
      ),
    });

    if (data.evidence.some((evidence) => evidence.freshness !== "current")) {
      throw new Error("Current evidence required.");
    }

    this.put(data.id, task.brief.owner, "collection", task.id, data);

    return data;
  }

  updateCollection(
    owner: string,
    id: string,
    title: string,
    notes: string,
    order: string[],
    expectedRevision: number,
  ) {
    const collection = CollectionSchema.parse(
      this.get(id, owner, "collection"),
    );

    if (collection.revision !== expectedRevision) {
      throw new ConflictError("Board changed; reload it.");
    }

    if (
      new Set(order).size !== collection.items.length ||
      order.length !== collection.items.length ||
      order.some((id) => !collection.items.some((item) => item.id === id))
    ) {
      throw new Error("Collection order must retain its exact identities.");
    }

    collection.items = order.map((id) =>
      collection.items.find((item) => item.id === id)!,
    );
    collection.title = title;
    collection.notes = notes;
    collection.revision++;
    CollectionSchema.parse(collection);
    const updated = this.db
      .prepare(
        `UPDATE outcomes SET state=?
       WHERE id=?
       AND owner=?
       AND kind='collection'
       AND json_extract(state,'$.revision')=?`,
      )
      .run(JSON.stringify(collection), id, owner, expectedRevision);

    if (!updated.changes) {
      throw new ConflictError("Board changed; reload it.");
    }

    return collection;
  }

  removeCollection(owner: string, id: string) {
    this.get(id, owner, "collection");
    this.db
      .prepare(
        "DELETE FROM outcomes WHERE id=? AND owner=? AND kind='collection'",
      )
      .run(id, owner);
  }

  shares(owner: string, taskId: string) {
    return this.list(owner, "share", taskId).map((s) => ShareSchema.parse(s));
  }

  share(
    task: Task,
    artifactIds: string[],
    participantId: string | null,
    days: number,
  ) {
    if (
      participantId &&
      !task.brief.participants.some(
        (participant) => participant.id === participantId,
      )
    ) {
      throw new Error("Choose an existing participant.");
    }

    if (
      !Number.isInteger(days) ||
      days < 1 ||
      days > 7 ||
      this.shares(task.brief.owner, task.id).length >= 30
    ) {
      throw new Error("Share limit reached.");
    }

    const snapshot = outcomeSnapshot(task, artifactIds, true);
    const token = randomBytes(32).toString("base64url");
    const data = ShareSchema.parse({
      id: randomUUID(),
      taskId: task.id,
      participantId,
      snapshot,
      expiresAt: new Date(this.now().getTime() + days * 86400000).toISOString(),
      revoked: false,
    });
    this.put(data.id, task.brief.owner, "share", task.id, data);
    this.db
      .prepare("INSERT INTO review_tokens VALUES(?,?)")
      .run(this.hash(token), data.id);

    return { ...data, token };
  }

  revoke(owner: string, id: string) {
    const share = ShareSchema.parse(this.get(id, owner, "share"));
    share.revoked = true;
    this.put(id, owner, "share", share.taskId, share);
  }

  private hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private link(token: string) {
    if (!/^[\w-]{43}$/.test(token)) {
      throw new AccessError("Review link unavailable.");
    }

    const row = this.db
      .prepare(
        "SELECT o.owner,o.state FROM review_tokens t JOIN outcomes o ON o.id=t.share WHERE t.hash=? AND o.kind='share'",
      )
      .get(this.hash(token));

    if (!row) {
      throw new AccessError("Review link unavailable.");
    }

    const share = ShareSchema.parse(JSON.parse(String(row.state)));

    if (share.revoked || Date.parse(share.expiresAt) <= this.now().getTime()) {
      throw new AccessError("Review link unavailable.");
    }

    return { owner: String(row.owner), share };
  }

  reviewPage(token: string) {
    const { share } = this.link(token);

    return {
      snapshot: share.snapshot,
      canProposePreference: Boolean(share.participantId),
      expiresAt: share.expiresAt,
      access: "Private bearer link; identity is not independently verified.",
    };
  }

  review(token: string, raw: ReviewInput) {
    const { owner, share } = this.link(token);
    const proposal = ReviewInputSchema.parse(raw);

    if (proposal.type === "preference" && !share.participantId) {
      throw new AccessError("This link permits comments only.");
    }

    if (
      Number(
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM outcomes WHERE owner=? AND kind='review' AND json_extract(state,'$.shareId')=?",
          )
          .get(owner, share.id)?.count,
      ) >= 30
    ) {
      throw new Error("Review limit reached.");
    }

    const result = ReviewSchema.parse({
      id: randomUUID(),
      shareId: share.id,
      taskId: share.taskId,
      participantId: share.participantId,
      at: this.now().toISOString(),
      proposal,
      accepted: false,
    });
    this.put(result.id, owner, "review", share.taskId, result);

    return { id: result.id, status: "pending-owner-review" };
  }

  reviews(owner: string, taskId: string) {
    return this.list(owner, "review", taskId).map((r) => ReviewSchema.parse(r));
  }

  getReview(owner: string, id: string) {
    return ReviewSchema.parse(this.get(id, owner, "review"));
  }

  accept(owner: string, id: string) {
    const review = this.getReview(owner, id);

    if (review.accepted) {
      throw new ConflictError("Already accepted.");
    }

    review.accepted = true;
    this.put(id, owner, "review", review.taskId, review);
  }

  blind(task: Task) {
    if (
      task.evaluation?.status !== "ok" ||
      task.evaluation.version !== task.brief.version
    ) {
      throw new Error("Run a current same-pool comparison first.");
    }

    const ids = new Set(task.candidates.map((candidate) => candidate.id));

    if (
      [...task.evaluation.baseline, ...task.evaluation.assisted].some(
        (id) => !ids.has(id),
      )
    ) {
      throw new Error("Comparison contains an unknown candidate.");
    }

    const total = Number(
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM outcomes WHERE owner=? AND kind='assessment'",
        )
        .get(task.brief.owner)?.count,
    );

    if (total >= 100) {
      throw new Error("Assessment limit reached.");
    }

    const aIsBaseline = randomInt(2) === 0;
    const result = AssessmentSchema.parse({
      id: randomUUID(),
      taskId: task.id,
      sourceVersion: task.brief.version,
      at: this.now().toISOString(),
      A: aIsBaseline ? task.evaluation.baseline : task.evaluation.assisted,
      B: aIsBaseline ? task.evaluation.assisted : task.evaluation.baseline,
      aIsBaseline,
      response: null,
    });
    this.put(result.id, task.brief.owner, "assessment", task.id, result);

    return {
      id: result.id,
      A: result.A,
      B: result.B,
      sourceVersion: result.sourceVersion,
      limitation:
        "Same Qloo-derived candidate pool; this comparison has selection bias. One assessment is not market validation.",
    };
  }

  assess(
    owner: string,
    id: string,
    version: number,
    response: {
      choice: "A" | "B" | "no-preference" | "insufficient-evidence";
      reason: string;
    },
  ) {
    const assessment = AssessmentSchema.parse(
      this.get(id, owner, "assessment"),
    );

    if (assessment.sourceVersion !== version || assessment.response) {
      throw new ConflictError("Comparison changed or already assessed.");
    }

    assessment.response = { ...response, at: this.now().toISOString() };
    AssessmentSchema.parse(assessment);
    this.put(id, owner, "assessment", assessment.taskId, assessment);

    return {
      ...assessment,
      validation:
        "Recorded session-owner feedback, not a verified professional interview.",
    };
  }

  close() {
    this.db.close();
  }
}

let globalOutcomes: OutcomeStore | undefined;

export function getOutcomes() {
  return (globalOutcomes ??= new OutcomeStore(
    process.env.IGOR_OUTCOMES_PATH ?? `${process.cwd()}/.igor/outcomes.sqlite`,
  ));
}
