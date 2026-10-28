import { describe, expect, it, vi } from "vitest";
import { GET } from "../../src/app/api/health/route";

describe("release-parity liveness", () => {
  it("reports only a valid deployed source revision", async () => {
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "a".repeat(40));
    vi.stubEnv("SECRET_API_KEY", "never-expose-this");

    try {
      const response = await GET();
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const body = await response.text();
      expect(JSON.parse(body)).toEqual({
        status: "ok",
        revision: "a".repeat(40),
      });
      expect(body).not.toContain("never-expose");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not reveal malformed revision or arbitrary environment values", async () => {
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "PRIVATE-SECRET-OR-ERROR");
    vi.stubEnv("IGOR_BUILD_SHA", "");

    try {
      expect(await (await GET()).json()).toEqual({
        status: "ok",
        revision: "unknown",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
