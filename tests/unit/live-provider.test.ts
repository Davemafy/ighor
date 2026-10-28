import { afterEach, describe, it, expect, vi } from "vitest";
import {
  LiveQlooProvider,
  MemoryResponseCache,
  explanationEntities,
} from "../../src/tools/qloo-live";
import { ToolCallingModel } from "../../src/tools/tool-model";
import { freshLiveExample } from "../../src/data/live-task";
import { runTurn } from "../../src/core/orchestrator";
import { SqliteTaskStore } from "../../src/data/store";
import { fitFor } from "../../src/capabilities/collaborate";

const seed = "11111111-1111-4111-8111-111111111111";

const ids = {
  movie: "22222222-2222-4222-8222-222222222222",
  tv_show: "33333333-3333-4333-8333-333333333333",
  artist: "44444444-4444-4444-8444-444444444444",
};

const stores: SqliteTaskStore[] = [];

afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
  vi.restoreAllMocks();
});

function transport() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    expect(u.origin).toBe("https://hackathon.api.qloo.com");
    expect(init?.redirect).toBe("error");

    if (u.pathname === "/search") {
      return Response.json({
        results: [
          {
            entity_id: seed,
            name: u.searchParams.get("query"),
            subtype: ["Spirited Away", "Arrival", "Moonlight"].includes(
              u.searchParams.get("query") ?? "",
            )
              ? "urn:entity:movie"
              : "urn:entity:artist",
          },
        ],
      });
    }

    const type = u.searchParams
      .get("filter.type")!
      .replace("urn:entity:", "") as keyof typeof ids;

    return Response.json({
      results: {
        entities: [
          {
            entity_id: ids[type],
            name: `Mock ${type}`,
            subtype: `urn:entity:${type}`,
            query: { affinity: 0.72 },
            properties: {
              description: "Synthetic test provider response, never live.",
            },
          },
        ],
      },
      query: {
        explainability: {
          "signal.interests.entities": {
            effect_on_top10_recs: [{ entity_id: seed, avg_score: 1 }],
          },
        },
      },
    });
  }) as unknown as ReturnType<typeof vi.fn<typeof fetch>>;
}

function discovery() {
  const t = freshLiveExample("t", "o");
  t.brief.participants = t.brief.participants.slice(0, 1);

  return {
    participants: t.brief.participants,
    catalogue: [],
    entities: [],
    location: "At home",
    version: 1,
    mode: "none",
  };
}

describe("live adapter contract with mocked HTTP, not live Qloo evidence", () => {
  it("production task has no fixture catalogue", () => {
    const t = freshLiveExample("a", "b");
    expect(t.mode).toBe("qloo-live");
    expect(t.catalogue).toEqual([]);
    expect(t.brief.participants).toHaveLength(6);
  });
  it("resolves exact IDs and caches search without another request", async () => {
    const http = transport();
    const p = new LiveQlooProvider("test-key", new MemoryResponseCache(), http);
    expect((await p.resolve("Radiohead")).data.providerId).toBe(seed);
    expect((await p.resolve("Radiohead")).requestCount).toBe(0);
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("leaves duplicate exact matches ambiguous", async () => {
    const http = vi.fn(async () =>
      Response.json({
        results: [
          { entity_id: seed, name: "Phoenix", subtype: "urn:entity:artist" },
          {
            entity_id: ids.movie,
            name: "Phoenix",
            subtype: "urn:entity:movie",
          },
        ],
      }),
    ) as typeof fetch;
    const r = await new LiveQlooProvider("test-key", undefined, http).resolve(
      "Phoenix",
    );
    expect(r.status).toBe("ambiguous");
    expect(r.data.providerId).toBeNull();
  });
  it("does not accept a lone fuzzy match as resolved", async () => {
    const http = vi.fn(async () =>
      Response.json({
        results: [
          { entity_id: seed, name: "Different", subtype: "urn:entity:artist" },
        ],
      }),
    ) as typeof fetch;
    expect(
      (await new LiveQlooProvider("test-key", undefined, http).resolve("Seed"))
        .data.status,
    ).toBe("unresolved");
  });
  it("queries three domains per person, normalizes affinity and preserves contributors", async () => {
    const http = transport();
    const p = new LiveQlooProvider("test-key", undefined, http);
    const r = await p.discover(discovery());
    expect(r.status).toBe("ok");
    expect(r.data.options.map((c) => c.type)).toEqual(
      expect.arrayContaining(["movie", "tv_show", "artist"]),
    );
    expect(r.data.options[0].cultural?.amara).toMatchObject({
      affinity: 0.72,
      rank: 1,
      delivery: "LIVE",
      explanationEntities: [{ entity_id: seed, avg_score: 1 }],
    });
    expect(
      r.data.options.every(
        (c) =>
          c.cost.value === null &&
          c.duration.value === null &&
          c.available === null,
      ),
    ).toBe(true);
  });
  it("serves cached discovery and preserves retrieval timestamps", async () => {
    const p = new LiveQlooProvider("test-key", undefined, transport());
    const a = await p.discover(discovery());
    const b = await p.discover(discovery());
    expect(b.requestCount).toBe(0);
    expect(b.data.options[0].cultural?.amara.delivery).toBe("CACHED");
    expect(b.data.evidence[0].at).toBe(a.data.evidence[0].at);
  });
  it("has a strict cache-only mode with no network fallback", async () => {
    const http = transport();
    const r = await new LiveQlooProvider(
      "test-key",
      undefined,
      http,
      30,
      true,
    ).discover(discovery());
    expect(r.status).toBe("blocked");
    expect(http).not.toHaveBeenCalled();
  });
  it("missing server key blocks without exposing or attempting a request", async () => {
    const http = transport();
    const r = await new LiveQlooProvider("", undefined, http).resolve(
      "Radiohead",
    );
    expect(r.status).toBe("blocked");
    expect(r.requestCount).toBe(0);
    expect(http).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])(
    "handles HTTP %s without retry or leaked error body",
    async (status) => {
      const http = vi.fn(
        async () => new Response("test-key private body", { status }),
      ) as typeof fetch;
      const r = await new LiveQlooProvider("test-key", undefined, http).resolve(
        "Radiohead",
      );
      expect(r.status).toBe([401, 403].includes(status) ? "blocked" : "error");
      expect(r.requestCount).toBe(1);
      expect(JSON.stringify(r)).not.toContain("private body");
      expect(http).toHaveBeenCalledTimes(1);
    },
  );
  it("enforces the per-run network ceiling", async () => {
    const p = new LiveQlooProvider("test-key", undefined, transport(), 1);
    const r = await p.discover(discovery());
    expect(p.calls).toBe(1);
    expect(r.data.options).toEqual([]);
  });
  it("expires cache entries", () => {
    const c = new MemoryResponseCache(1);
    c.set("x", { at: new Date(0).toISOString(), body: { results: [] } });
    expect(c.get("x")).toBeNull();
  });
  it("never invents explanations from metadata", () => {
    expect(
      explanationEntities({ query: "anything", signal: "artist" }),
    ).toEqual([]);
  });
  it("rejects malformed provider data", async () => {
    const http = vi.fn(async () =>
      Response.json({
        results: { entities: [{ entity_id: "bad", name: "x" }] },
      }),
    ) as typeof fetch;
    expect(
      (await new LiveQlooProvider("test-key", undefined, http).resolve("Seed"))
        .status,
    ).toBe("error");
  });
  it("only selects retrieved candidates; user facts enable a TV/movie programme and revisions reuse retrieval", async () => {
    const s = new SqliteTaskStore(":memory:");
    stores.push(s);
    const t = freshLiveExample("t", "o");
    t.brief.goal = "Gather";
    s.create(t);
    const cache = new MemoryResponseCache();
    const p = new LiveQlooProvider("test-key", cache, transport());
    let task = await runTurn(
      s,
      "t",
      "o",
      { type: "constraints", budget: 50, version: 0 },
      undefined,
      p,
    );
    expect(task.status).toBe("partial");
    expect(task.brief.selected).toEqual([]);
    expect(task.candidates.every((c) => c.eligibility === "needs-review")).toBe(
      true,
    );
    const options = task.catalogue.map((c) => ({
      ...c,
      cost: { ...c.cost, value: 5 },
      duration: { ...c.duration, value: c.type === "artist" ? 15 : 60 },
      available: true,
    }));
    task = await runTurn(
      s,
      "t",
      "o",
      { type: "catalogue", options, version: task.brief.version },
      undefined,
      new LiveQlooProvider("test-key", cache, transport()),
    );
    expect(task.status).toBe("ready");
    expect(
      task.brief.selected.every((id) => Object.values(ids).includes(id)),
    ).toBe(true);
    const calls = task.trace.reduce((a, b) => a + b.requests, 0);
    task = await runTurn(
      s,
      "t",
      "o",
      { type: "constraints", budget: 1, version: task.brief.version },
      undefined,
      new LiveQlooProvider("test-key", cache, transport()),
    );
    expect(task.brief.selected).toEqual([]);
    expect(task.trace.reduce((a, b) => a + b.requests, 0)).toBe(calls);
  });
  it("uses rank, not raw cross-query affinity, and missing is not dislike", async () => {
    const r = await new LiveQlooProvider(
      "test-key",
      undefined,
      transport(),
    ).discover(discovery());
    const c = r.data.options[0];
    const ps = freshLiveExample("t", "o").brief.participants;
    expect(fitFor(c, ps).amara).toBe(1);
    expect(fitFor(c, ps).leo).toBe(0);
  });
});

describe("bounded tool-calling model and in-product baseline", () => {
  it("rejects oversized model input before any request", async () => {
    const http = vi.fn() as unknown as typeof fetch;
    const model = new ToolCallingModel("test-key", "test-model", http);
    await expect(model.interpret("x".repeat(210000))).rejects.toThrow(
      "input size budget",
    );
    expect(model.calls).toBe(0);
    expect(http).not.toHaveBeenCalled();
  });
  const fn = (name: string, args: unknown) =>
    Response.json({
      status: "completed",
      output: [
        {
          type: "function_call",
          name,
          call_id: "call1",
          arguments: JSON.stringify(args),
        },
      ],
    });
  it("counts and caps model calls without a retry", async () => {
    const http = vi.fn(async () =>
      fn("update_brief", {
        supported: true,
        intent: "revision",
        kind: "gathering",
        goal: "",
        budget: 20,
        duration: null,
        wording: null,
      }),
    ) as typeof fetch;
    const model = new ToolCallingModel("test-key", "test-model", http, 1);
    await model.interpret("budget 20");
    await expect(model.interpret("budget 10")).rejects.toThrow("budget");
    expect(model.calls).toBe(1);
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("cannot select an entity the provider never returned", async () => {
    const task = freshLiveExample("t", "o");
    const result = await new LiveQlooProvider(
      "test-key",
      undefined,
      transport(),
    ).discover(discovery());
    task.candidates = result.data.options.map((c) => ({
      ...c,
      eligibility: "needs-review",
      dependencies: [],
      freshness: "current",
      missing: [],
      violations: [],
      evidenceIds: [],
      fit: {},
      fitReason: "",
    }));
    let n = 0;
    const http = vi.fn(async () =>
      n++ === 0
        ? fn("inspect_candidates", {})
        : fn("submit_selection", { ids: ["invented"] }),
    ) as typeof fetch;
    await expect(
      new ToolCallingModel("test-key", "test-model", http).recommend(
        task,
        true,
      ),
    ).rejects.toThrow("outside Qloo");
  });
  it("extracts brief corrections through a validated allowlisted tool", async () => {
    const http = vi.fn(async () =>
      fn("update_brief", {
        supported: true,
        intent: "revision",
        kind: "gathering",
        goal: "",
        budget: 20,
        duration: null,
        wording: null,
      }),
    ) as typeof fetch;
    expect(
      (
        await new ToolCallingModel("test-key", "test-model", http).interpret(
          "budget 20",
        )
      ).budget,
    ).toBe(20);
  });
  it("rejects unauthorized model tools", async () => {
    const http = vi.fn(async () => fn("fetch_url", {})) as typeof fetch;
    await expect(
      new ToolCallingModel("test-key", "test-model", http).interpret("x"),
    ).rejects.toThrow("Unauthorized");
  });
  it("baseline gets identical profiles and pool but no cultural ranking fields", async () => {
    const t = freshLiveExample("t", "o");
    const result = await new LiveQlooProvider(
      "test-key",
      undefined,
      transport(),
    ).discover(discovery());
    t.candidates = result.data.options.map((c) => ({
      ...c,
      eligibility: "needs-review",
      dependencies: [],
      freshness: "current",
      missing: [],
      violations: [],
      evidenceIds: [],
      fit: {},
      fitReason: "",
    }));
    const bodies: Record<string, unknown>[] = [];
    let n = 0;
    const http = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));

      return n++ % 2 === 0
        ? fn("inspect_candidates", {})
        : fn("submit_selection", { ids: [ids.movie] });
    }) as typeof fetch;
    const model = new ToolCallingModel("test-key", "test-model", http);
    await model.recommend(t, false);
    await model.recommend(t, true);
    const output = (b: Record<string, unknown>) =>
      JSON.parse(
        (b.input as { type?: string; output?: string }[]).find(
          (x) => x.type === "function_call_output",
        )!.output!,
      );
    const baseline = output(bodies[1]);
    const assisted = output(bodies[3]);
    expect(baseline.profiles).toEqual(assisted.profiles);
    expect(baseline.candidates.map((c: { id: string }) => c.id)).toEqual(
      assisted.candidates.map((c: { id: string }) => c.id),
    );
    expect(JSON.stringify(baseline)).not.toMatch(
      /queryId|affinity|explanationEntities/,
    );
    expect(JSON.stringify(assisted)).toContain("affinity");
  });
  it("unconfigured model cannot fabricate an in-product baseline", async () => {
    const s = new SqliteTaskStore(":memory:");
    stores.push(s);
    s.create(freshLiveExample("t", "o"));
    const t = await runTurn(s, "t", "o", { type: "baseline", version: 0 });
    expect(t.evaluation?.status).toBe("blocked");
    expect(t.evaluation?.baseline).toEqual([]);
  });
});

it("resolves a filmmaker as a Qloo person without substituting a film", async () => {
  const request = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("types")).toBe("urn:entity:person");

    return Response.json({
      results: [
        { entity_id: seed, name: "Wong Kar-wai", subtype: "urn:entity:person" },
      ],
    });
  });
  const provider = new LiveQlooProvider(
    "unit-private-credential",
    new MemoryResponseCache(),
    request,
  );
  const result = await provider.resolve("Wong Kar-wai", "person");
  expect(result.status).toBe("ok");
  expect(result.data).toMatchObject({
    name: "Wong Kar-wai",
    type: "person",
    providerId: seed,
    status: "resolved",
  });
  expect(request).toHaveBeenCalledOnce();
});
