import { cookies } from "next/headers";
import { getStore } from "@/data/store";
import { ownerFromToken, sessionCookie } from "@/core/security";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const token = (await cookies()).get(sessionCookie)?.value;

  if (!token) {
    return Response.json({ error: "Session required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    const owner = ownerFromToken(token);
    const store = getStore();
    store.recoverExpiredTurns(id, owner);

    return Response.json(store.load(id, owner), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Workspace not found." }, { status: 404 });
  }
}
