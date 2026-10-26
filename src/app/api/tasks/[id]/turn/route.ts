import { cookies } from "next/headers";
import { ZodError } from "zod";
import { getStore } from "@/data/store";
import { runTurn } from "@/core/orchestrator";
import { checkOrigin, ownerFromToken, sessionCookie } from "@/core/security";
import { readBoundedJson } from "@/core/server-input";
import { TurnSchema } from "@/core/contracts";

export const runtime = "nodejs";

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

    const input = TurnSchema.parse(await readBoundedJson(request));
    const owner = ownerFromToken(token);
    const { id } = await context.params;
    const store = getStore();
    let task;

    try {
      task = store.load(id, owner);
    } catch {
      return Response.json({ error: "Workspace not found." }, { status: 404 });
    }

    if (task.brief.version !== input.version) {
      return Response.json(
        {
          error: "A newer edit exists. Reload the workspace.",
          code: "conflict",
        },
        { status: 409 },
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          } catch {
            /* Client disconnected; never bypass version checks. */
          }
        };

        try {
          await runTurn(store, id, owner, input, send);
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
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
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
