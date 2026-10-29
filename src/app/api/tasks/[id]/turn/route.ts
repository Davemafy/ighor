import { isActiveTurn } from "@/core/turn-lifecycle";
import { cookies } from "next/headers";
import { z, ZodError } from "zod";
import { randomUUID } from "node:crypto";
import {
  AccessError,
  ConflictError,
  TurnIdReuseError,
  getStore,
} from "@/data/store";
import { runTurn } from "@/core/orchestrator";
import { checkOrigin, ownerFromToken, sessionCookie } from "@/core/security";
import { readBoundedJson } from "@/core/server-input";
import { TurnSchema, type Event } from "@/core/contracts";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = (await cookies()).get(sessionCookie)?.value;

    if (!token) {
      return Response.json({ error: "Session required." }, { status: 401 });
    }

    const url = new URL(request.url);
    const turnId = z.string().uuid().parse(url.searchParams.get("turnId"));
    const afterRaw = Number(
      url.searchParams.get("after") ??
        request.headers.get("Last-Event-ID") ??
        "0",
    );
    const after = z.number().int().min(0).max(100000).parse(afterRaw);
    const owner = ownerFromToken(token);
    const { id } = await context.params;

    return Response.json(getStore().readTurn(id, owner, turnId, after), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: "Turn not found or request invalid." },
      { status: error instanceof AccessError ? 404 : 400 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const token = (await cookies()).get(sessionCookie)?.value;

    if (!token) {
      return Response.json({ error: "Session required." }, { status: 401 });
    }

    const length = Number(request.headers.get("content-length") ?? 0);

    if (length > 100000) {
      return Response.json({ error: "Request is too large." }, { status: 413 });
    }

    // Accept a stable client turn ID without changing the old TurnSchema.
    // Legacy clients are compatible but cannot safely dedupe their retries.
    const raw = z
      .record(z.string(), z.unknown())
      .parse(await readBoundedJson(request));
    const turnId =
      raw.clientTurnId === undefined
        ? randomUUID()
        : z.string().uuid().parse(raw.clientTurnId);
    const { clientTurnId: _clientTurnId, workspaceId, ...payload } = raw;
    void _clientTurnId;
    const input = TurnSchema.parse(payload);
    const owner = ownerFromToken(token);
    const { id } = await context.params;

    if (workspaceId !== undefined && workspaceId !== id) {
      return Response.json(
        { error: "Workspace context mismatch." },
        { status: 400 },
      );
    }

    const store = getStore();
    let admitted;

    try {
      admitted = store.acceptTurn(id, owner, turnId, input);
    } catch (error) {
      if (error instanceof ConflictError) {
        return Response.json(
          {
            error: "A newer edit exists. Reload the workspace.",
            code: "conflict",
          },
          { status: 409 },
        );
      }

      if (error instanceof TurnIdReuseError) {
        return Response.json(
          {
            error: "This turn ID belongs to a different request.",
            code: "turn-id-reuse",
          },
          { status: 409 },
        );
      }

      if (error instanceof AccessError) {
        return Response.json(
          { error: "Workspace not found." },
          { status: 404 },
        );
      }

      throw error;
    }

    if (admitted.duplicate) {
      const saved = store.readTurn(id, owner, turnId);
      const replay = saved.events
        .map(
          ({ sequence, event }) =>
            `id: ${sequence}\ndata: ${JSON.stringify(event.type === "state" || event.type === "done" ? { ...event, task: saved.task } : event)}\n\n`,
        )
        .join("");
      const terminal = !isActiveTurn(saved.status);
      const continuation = terminal
        ? ""
        : `data: ${JSON.stringify({
            type: "error",
            code: "already-running",
            message:
              "Your request was already accepted. Your saved work is safe; refresh to check its progress.",
          })}\n\n`;

      return new Response(replay + continuation, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "X-Igor-Turn-Id": turnId,
        },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Event) => {
          // Store server-generated progress BEFORE attempting network delivery.
          // A disconnected client cannot suppress event persistence.
          const sequence = store.recordTurnEvent(id, owner, turnId, event);

          if (sequence === undefined) {
            return;
          }

          try {
            controller.enqueue(
              encoder.encode(
                `id: ${sequence}\ndata: ${JSON.stringify(event)}\n\n`,
              ),
            );
          } catch {
            /* Client disconnected; never bypass version checks. */
          }
        };

        // Admission and its first event were one transaction. Deliver that
        // existing event without manufacturing a second acceptance record.
        for (const saved of store.readTurn(id, owner, turnId).events) {
          try {
            controller.enqueue(
              encoder.encode(
                `id: ${saved.sequence}\ndata: ${JSON.stringify(saved.event)}\n\n`,
              ),
            );
          } catch {
            /* Disconnected. */
          }
        }

        // Keep proxies and clients informed while inference or retrieval runs.
        const heartbeat = setInterval(() => {
          try {
            if (!store.renewTurnLease(id, owner, turnId, admitted.runId)) {
              const snapshot = store.readTurn(id, owner, turnId);
              const terminal = store.readTurn(
                id,
                owner,
                turnId,
                Math.max(0, snapshot.lastSequence - 1),
              );

              for (const saved of terminal.events) {
                controller.enqueue(
                  encoder.encode(
                    `id: ${saved.sequence}\ndata: ${JSON.stringify(saved.event)}\n\n`,
                  ),
                );
              }

              controller.close();
              clearInterval(heartbeat);

              return;
            }

            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            /* The client may have left. */
          }
        }, 10000);

        try {
          send({
            type: "action",
            phase: "understanding",
            runId: admitted.runId,
            message:
              input.type === "message"
                ? "Reading your message"
                : input.type === "artifact"
                  ? "Saving your changes"
                  : "Working on your request",
          });
          const acceptedInput = {
            ...input,
            version: admitted.acceptedVersion,
          };
          await runTurn(
            store.forTurn(id, owner, turnId, admitted.runId),
            id,
            owner,
            acceptedInput,
            send,
            undefined,
            undefined,
            undefined,
            undefined,
            input.type === "message",
          );
        } catch (error) {
          const conflict =
            error instanceof Error &&
            "code" in error &&
            error.code === "conflict";
          send({
            type: "error",
            code: conflict ? "conflict" : "invalid-action",
            message: conflict
              ? "A newer correction is saved. Reload to continue."
              : "The action was rejected. Review its inputs.",
          });
        } finally {
          clearInterval(heartbeat);

          try {
            controller.close();
          } catch {
            /* Already disconnected or fenced. */
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
        "X-Igor-Turn-Id": turnId,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ZodError
            ? "Invalid input. Check the fields and try again."
            : "Request rejected.",
      },
      { status: 400 },
    );
  }
}
