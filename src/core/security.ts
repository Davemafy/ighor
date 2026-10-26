import { getAuth } from "../data/auth-store";

export const sessionCookie = "igor_session";

export function ownerFromToken(token: string) {
  if (!/^[a-f0-9-]{36}$/.test(token)) {
    throw new Error("Invalid session.");
  }

  return getAuth().owner(token);
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const expected = `${url.protocol}//${host}`;

  if (origin && origin !== expected) {
    throw new Error("Cross-origin writes are not allowed.");
  }

  const site = request.headers.get("sec-fetch-site");

  if (site === "cross-site") {
    throw new Error("Cross-origin writes are not allowed.");
  }
}
