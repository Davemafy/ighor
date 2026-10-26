import { getOutcomes } from "@/data/outcome-store";
import { ReviewInputSchema } from "@/core/outcomes";
import { checkOrigin } from "@/core/security";
import { readBoundedJson } from "@/core/server-input";

export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;

    return Response.json(getOutcomes().reviewPage(token), { headers });
  } catch {
    return Response.json(
      { error: "Review link expired, revoked or unavailable." },
      { status: 404, headers },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    checkOrigin(request);
    const { token } = await context.params;
    const input = ReviewInputSchema.parse(
      await readBoundedJson(request, 10000),
    );

    return Response.json(getOutcomes().review(token, input), { headers });
  } catch {
    return Response.json(
      { error: "Review could not be saved. Check link permissions and input." },
      { status: 400, headers },
    );
  }
}
