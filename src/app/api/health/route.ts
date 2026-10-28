import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness and release parity only: no credentials or environment dumps. */
export async function GET() {
  const revision =
    process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.IGOR_BUILD_SHA ?? "";
  const safeRevision = /^[a-f0-9]{7,40}$/i.test(revision)
    ? revision
    : "unknown";

  return NextResponse.json(
    { status: "ok", revision: safeRevision },
    { headers: { "Cache-Control": "no-store" } },
  );
}
