import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getStore } from "@/data/store";
import { freshTask } from "@/data/fixtures";
import { freshLiveTask } from "@/data/live-task";
import { checkOrigin, ownerFromToken, sessionCookie } from "@/core/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const jar = await cookies();
    let token = jar.get(sessionCookie)?.value;

    if (!token) {
      token = randomUUID();
      jar.set(sessionCookie, token, {
        httpOnly: true,
        sameSite: "strict",
        secure: new URL(request.url).protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    const owner = ownerFromToken(token);
    const store = getStore();
    // Each intentional New workspace creates a distinct record. Memory is copied only within this session owner.
    const task =
      process.env.IGOR_TEST_FIXTURES === "1"
        ? freshTask(randomUUID(), owner)
        : freshLiveTask(randomUUID(), owner);
    task.preferences = store.memory(owner);
    store.create(task);

    return Response.json(task, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Could not create a workspace." },
      { status: 400 },
    );
  }
}

export async function GET() {
  const token = (await cookies()).get(sessionCookie)?.value;

  if (!token) {
    return Response.json({ tasks: [] });
  }

  try {
    return Response.json(
      {
        tasks: getStore()
          .list(ownerFromToken(token))
          .map((t) => ({
            id: t.id,
            goal: t.brief.goal,
            title: (
              t.work?.goals.find((goal) => goal.id === t.work?.activeGoalId)
                ?.title ||
              t.brief.goal ||
              t.messages.find((message) => message.role === "user")?.text ||
              "A new conversation"
            ).slice(0, 120),
            version: t.brief.version,
            preview: (
              t.work?.documents.at(-1)?.content ||
              t.messages.filter((message) => message.role === "user").at(-1)
                ?.text ||
              ""
            ).slice(0, 240),
            updatedAt: t.messages.at(-1)?.at || null,
          })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Invalid session." }, { status: 401 });
  }
}
