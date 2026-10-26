import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getStore, ConflictError, AccessError } from "@/data/store";
import { getOutcomes } from "@/data/outcome-store";
import { OutputActionSchema, collectionSourceChanged } from "@/core/outcomes";
import { checkOrigin, ownerFromToken, sessionCookie } from "@/core/security";
import { readBoundedJson } from "@/core/server-input";
import { runTurn } from "@/core/orchestrator";

export const runtime = "nodejs";

async function owned(context: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get(sessionCookie)?.value;

  if (!token) {
    throw new AccessError("Session required.");
  }

  const owner = ownerFromToken(token);
  const { id } = await context.params;

  return { task: getStore().load(id, owner), owner };
}

function error(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof ConflictError
          ? "A newer version or assessment exists. Reload."
          : e instanceof AccessError
            ? "Record not found."
            : "Action unavailable. Use current candidates/artifacts and a current comparison.",
    },
    {
      status:
        e instanceof ConflictError ? 409 : e instanceof AccessError ? 404 : 400,
    },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { task, owner } = await owned(context);
    const db = getOutcomes();

    return Response.json(
      {
        collections: db.collections(owner).map((collection) => {
          let sourceChanged = true;

          try {
            sourceChanged = collectionSourceChanged(
              collection,
              getStore().load(collection.taskId, owner),
            );
          } catch {
            sourceChanged = true;
          }

          return { ...collection, sourceChanged };
        }),
        shares: db.shares(owner, task.id),
        reviews: db.reviews(owner, task.id),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return error(e);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const input = OutputActionSchema.parse(await readBoundedJson(request));
    const { task, owner } = await owned(context);
    const db = getOutcomes();

    if (input.version !== task.brief.version) {
      throw new ConflictError("Newer task exists.");
    }

    let result: unknown;

    switch (input.type) {
      case "update-collection":
        result = db.updateCollection(
          owner,
          input.id,
          input.title,
          input.notes,
          input.order,
          input.revision,
        );
        break;
      case "collection":
        result = db.collect(task, input.title, input.candidateIds);
        break;
      case "delete-collection":
        db.removeCollection(owner, input.id);
        result = { status: "deleted" };
        break;

      case "share": {
        const share = db.share(
          task,
          input.artifactIds,
          input.participantId,
          input.expiresInDays,
        );
        result = { ...share, path: `/review/${share.token}` };
        break;
      }

      case "revoke":
        db.revoke(owner, input.id);
        result = { status: "revoked" };
        break;
      case "blind-comparison":
        result = db.blind(task);
        break;
      case "assessment":
        result = db.assess(owner, input.id, task.brief.version, {
          choice: input.choice,
          reason: input.reason,
        });
        break;

      case "accept-review": {
        const review = db.getReview(owner, input.id);

        if (review.taskId !== task.id || review.accepted) {
          throw new ConflictError(
            "Review already applied or belongs to another task.",
          );
        }

        if (review.proposal.type === "comment") {
          db.accept(owner, review.id);
          result = { status: "acknowledged" };
          break;
        }

        if (task.reviewEffects?.includes(review.id)) {
          db.accept(owner, review.id);
          result = { status: "accepted", task };
          break;
        }

        const participant = task.brief.participants.find(
          (participant) => participant.id === review.participantId,
        );

        if (!participant) {
          throw new AccessError("Participant no longer present.");
        }

        const proposed = review.proposal;
        const preferences = participant.preferences.filter(
          (preference) =>
            preference.value.toLowerCase() !== proposed.value.toLowerCase(),
        );
        preferences.push({
          id: randomUUID(),
          subject: participant.id,
          value: proposed.value,
          polarity: proposed.polarity,
          source: "user-supplied",
          confirmed: true,
          scope: "participant",
        });
        const updated = await runTurn(getStore(), task.id, owner, {
          type: "participant",
          reviewId: review.id,
          version: task.brief.version,
          participant: { ...participant, sample: false, preferences },
        });
        db.accept(owner, review.id);
        result = { status: "accepted", task: updated };
        break;
      }
    }

    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return error(e);
  }
}
