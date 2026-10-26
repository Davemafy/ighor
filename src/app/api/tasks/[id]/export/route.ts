import { cookies } from "next/headers";
import { getStore } from "@/data/store";
import { ownerFromToken, sessionCookie } from "@/core/security";
import { outcomeSnapshot, exportMarkdown } from "@/core/outcomes";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const token = (await cookies()).get(sessionCookie)?.value;

  if (!token) {
    return Response.json({ error: "Session required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const task = getStore().load(id, ownerFromToken(token));
    const url = new URL(request.url);
    const version = url.searchParams.get("version");

    if (version !== null && Number(version) !== task.brief.version) {
      return Response.json(
        { error: "A newer version exists. Reload." },
        { status: 409 },
      );
    }

    const format = url.searchParams.get("format") ?? "markdown";

    if (!["markdown", "json"].includes(format)) {
      throw new Error("Unsupported export.");
    }

    const ids = (url.searchParams.get("artifacts") ?? "main").split(",");
    const snapshot = outcomeSnapshot(task, ids);

    return new Response(
      format === "json"
        ? JSON.stringify(snapshot, null, 2)
        : exportMarkdown(snapshot),
      {
        headers: {
          "Content-Type":
            format === "json"
              ? "application/json; charset=utf-8"
              : "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="igor-outcome-v${task.brief.version}.${format === "json" ? "json" : "md"}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Export unavailable. Choose an existing artifact." },
      { status: 400 },
    );
  }
}
