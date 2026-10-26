import { cookies } from "next/headers";
import { sessionCookie } from "@/core/security";

/** Only a referrer-restricted browser key belongs here. Never reuse the server Qloo or model keys. */
export async function GET() {
  if (!(await cookies()).get(sessionCookie)?.value) {
    return Response.json({ error: "Session required." }, { status: 401 });
  }

  const browserKey =
    process.env.GOOGLE_MAPS_BROWSER_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return Response.json(
    { browserKey: browserKey || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
