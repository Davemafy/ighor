import {
  LiveQlooProvider,
  MemoryResponseCache,
} from "../../src/tools/qloo-live";
import { withToolDeadline } from "../../src/core/execution";
import { describe, expect, it, vi } from "vitest";
import {
  normalizeQloo,
  mapProviderError,
  safeSerialize,
} from "../../src/tools/qloo";
import { FixtureCulturalProvider } from "../../src/tools/fixture-provider";
import { checkOrigin, ownerFromToken } from "../../src/core/security";
import { CandidateInputSchema, EntitySchema } from "../../src/core/contracts";
import { readFileSync } from "node:fs";

describe("Qloo boundary contracts (synthetic inputs, no live calls)", () => {
  it("normalizes cross-category entities without inventing explainability", () => {
    const n = normalizeQloo({
      results: {
        entities: [
          { entity_id: "a", name: "A film", subtype: "urn:entity:movie" },
          { entity_id: "b", name: "An artist", subtype: "urn:entity:artist" },
        ],
      },
      query: { signals: ["artist"] },
    });
    expect(n.candidates.map((c) => c.type)).toEqual(["movie", "artist"]);
    expect(n.explanation).toBeNull();
  });
  it("does not promote an unverified metadata field into provider explainability", () => {
    const n = normalizeQloo({
      results: { entities: [] },
      query: { explainability: { signal: "entity" } },
    });
    expect(n.explanation).toBeNull();
  });
  it("supports empty results, rejects malformed and invalid entity types", () => {
    expect(normalizeQloo({ results: { entities: [] } }).status).toBe("empty");
    expect(() => normalizeQloo({ results: { items: [] } })).toThrow();
    expect(() =>
      normalizeQloo({ results: { entities: [{ name: "bad" }] } }),
    ).toThrow();
    expect(() =>
      normalizeQloo({
        results: {
          entities: [
            { entity_id: "x", name: "x", subtype: "urn:entity:unverified" },
          ],
        },
      }),
    ).toThrow();
  });
  it("does not silently resolve ambiguous identities", async () => {
    const r = await new FixtureCulturalProvider().resolve("Phoenix");
    expect(r.status).toBe("ambiguous");
    expect(r.data.providerId).toBeNull();
    expect(r.data.choices).toHaveLength(2);
    expect(EntitySchema.parse(r.data).status).toBe("ambiguous");
  });
  it("distinguishes confirmed fixture identity from missing matches", async () => {
    const p = new FixtureCulturalProvider();
    expect((await p.resolve("Radiohead")).data.status).toBe("resolved");
    expect((await p.resolve("An unknown band")).data.status).toBe("unresolved");
  });
  it("maps authentication, timeout and rate-limit errors safely", () => {
    expect(mapProviderError(401).status).toBe("blocked");
    expect(mapProviderError(403).status).toBe("blocked");
    expect(mapProviderError(429).retry).toBe("manual");
    expect(mapProviderError("timeout").warnings.join()).toContain("timed out");
    expect(mapProviderError("malformed").retry).toBe("never");
  });
  it("blocks the actual live adapter before transport when credentials are absent", async () => {
    const transport = vi.fn<typeof fetch>();
    const provider = new LiveQlooProvider(
      "",
      new MemoryResponseCache(),
      transport,
    );
    expect(await provider.resolve("Radiohead", "artist")).toMatchObject({
      status: "blocked",
      requestCount: 0,
    });
    expect(transport).not.toHaveBeenCalled();
  });
  it("redacts nested credentials and bounds unsafe evidence serialization", () => {
    const output = safeSerialize({
      authorization: "Bearer abc",
      query: {
        api_key: "secret123",
        name: "Bearer secretvalue",
        email: "private@example.com",
      },
      nested: ["qloo_12345678901"],
      large: "x".repeat(3000),
    });
    expect(output).not.toContain("secret123");
    expect(output).not.toContain("secretvalue");
    expect(output).not.toContain("private@example.com");
    expect(output).not.toContain("qloo_12345678901");
    expect(JSON.parse(output).large).toHaveLength(2000);
  });
  it("rejects malformed practical facts", () => {
    expect(() =>
      CandidateInputSchema.parse({ cost: { value: "cheap" } }),
    ).toThrow();
  });
});

describe("security boundaries", () => {
  it("rejects cross-site writes", () => {
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000/api/tasks", {
          headers: { Origin: "https://evil.example" },
        }),
      ),
    ).toThrow("Cross-origin");
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000/api/tasks", {
          headers: { Origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
  it("derives ownership from a validated opaque session token", () => {
    expect(ownerFromToken("12345678-1234-1234-1234-123456789012")).toHaveLength(
      64,
    );
    expect(() => ownerFromToken("../bad")).toThrow("Invalid");
  });
  it("client code has no credential access or provider network calls", () => {
    const source = readFileSync("src/components/workspace.tsx", "utf8");
    expect(source).not.toMatch(/process\.env|api\.qloo|QLOO_API_KEY/);
    const boundary = readFileSync("src/tools/qloo.ts", "utf8");
    expect(boundary).not.toContain("fetch(");
  });
});

it("rejects invalid confirmed identities and bounds a hung provider", async () => {
  const r = (await new FixtureCulturalProvider().resolve("Radiohead")).data;
  expect(() => EntitySchema.parse({ ...r, providerId: null })).toThrow();
  await expect(withToolDeadline(new Promise(() => {}), 5)).rejects.toThrow(
    "timed out",
  );
});

it("accepts the browser host when Next constructs an internal URL", () => {
  expect(() =>
    checkOrigin(
      new Request("http://0.0.0.0:3000/api/tasks", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
  ).not.toThrow();
});
