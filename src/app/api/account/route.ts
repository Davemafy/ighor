import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getAuth, AccountInput } from "@/data/auth-store";
import { checkOrigin, sessionCookie } from "@/core/security";
import { readBoundedJson } from "@/core/server-input";

export const runtime = "nodejs";

export async function GET() {
  try {
    const token = (await cookies()).get(sessionCookie)?.value;

    return Response.json(
      { account: token ? getAuth().identity(token) : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { account: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const data = AccountInput.parse(await readBoundedJson(request, 10000));
    const jar = await cookies();
    const result =
      data.action === "register"
        ? getAuth().register(
            data,
            jar.get(sessionCookie)?.value ?? randomUUID(),
          )
        : getAuth().login(data);
    jar.set(sessionCookie, result.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 7 * 86400,
    });

    return Response.json(
      { account: { username: result.username } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Account action failed. Check your details or try later." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const jar = await cookies();
    const token = jar.get(sessionCookie)?.value;

    if (token) {
      getAuth().logout(token);
    }

    jar.delete(sessionCookie);

    return Response.json({ status: "signed-out" });
  } catch {
    return Response.json({ error: "Sign out failed." }, { status: 400 });
  }
}
