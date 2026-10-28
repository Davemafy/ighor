import { describe, expect, it, vi } from "vitest";
import {
  BrightDataResearchProvider,
  publicResearchUrl,
} from "../../src/tools/live-research";

const searchResults = {
  organic: [
    {
      title: "Research source one",
      link: "https://example.com/report",
      description: "A short, unverified search snippet.",
    },
    {
      title: "Research source two",
      link: "https://example.org/findings",
      description: "Another snippet.",
    },
    {
      title: "Research source three",
      link: "https://example.net/background",
      description: "Background information.",
    },
    {
      title: "Local network",
      link: "http://127.0.0.1/private",
      description: "Must be excluded.",
    },
  ],
};

describe("server-only Bright Data research", () => {
  it.each([
    "http://example.com",
    "https://localhost/secret",
    "https://127.0.0.1/admin",
    "https://192.168.0.2/",
    "https://metadata.google.internal/data",
    "https://name:pass@example.com/",
    "ftp://example.com/data",
    "https://example.local/data",
    "https://example.com:8080/",
  ])("does not request unsafe link %s", (url) => {
    expect(publicResearchUrl(url)).toBeNull();
  });

  it("preserves safe HTTPS links without fragments", () => {
    expect(publicResearchUrl("https://example.org/page?q=x#section")).toBe(
      "https://example.org/page?q=x",
    );
  });

  it("blocks without credentials and never calls the network", async () => {
    const transport = vi.fn<typeof fetch>();
    const provider = new BrightDataResearchProvider("", "", "", transport);
    expect(await provider.research("a current question")).toMatchObject({
      status: "blocked",
      requests: 0,
      sources: [],
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("makes one search and at most two document reads, with separate provenance", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(_url).toBe("https://api.brightdata.com/request");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-key",
      );

      if (request.zone === "serp-test") {
        const query = new URL(request.url);
        expect(query.hostname).toBe("www.google.com");
        expect(query.searchParams.has("brd_json")).toBe(false);
        expect(query.searchParams.get("q")).toBe("2026 culture report");
        expect(request.format).toBe("json");
        expect(request.data_format).toBe("parsed");

        // User-verified Bright Data /request format wraps JSON SERP data
        // inside a {status_code, body} envelope.
        return Response.json({ status_code: 200, body: JSON.stringify(searchResults) });
      }

      expect(request.zone).toBe("read-test");
      expect(request.format).toBe("raw");
      expect(request.data_format).toBe("markdown");
      expect(request.url.startsWith("https://")).toBe(true);

      return new Response("## Retrieved page\nReport text from the webpage");
    });
    const provider = new BrightDataResearchProvider(
      "test-key",
      "serp-test",
      "read-test",
      transport,
    );
    const result = await provider.research("2026 culture report");
    expect(result.status).toBe("ok");
    expect(result.requests).toBe(3);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(result.sources).toHaveLength(3);
    expect(result.sources[0].excerpt).toContain("Retrieved page");
    expect(result.sources[1].excerpt).toContain("Retrieved page");
    expect(result.sources[2].excerpt).toBeUndefined();
    expect(result.sources[2].snippet).toContain("Background");
    expect(result.sources.some((s) => s.url.includes("127.0.0.1"))).toBe(false);
    expect(result.sources[0].retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reports snippet-only research as incomplete when no reading zone exists", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(searchResults),
    );
    const result = await new BrightDataResearchProvider(
      "test-key",
      "serp-zone",
      "",
      transport,
    ).research("new release details");
    expect(result.status).toBe("partial");
    expect(result.requests).toBe(1);
    expect(result.sources[0].excerpt).toBeUndefined();
    expect(result.warning).toContain("Search snippets");
  });

  it("does not erase valid search evidence after a failed source read", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const data = JSON.parse(String(init?.body));

      if (data.zone === "serp") {return Response.json(searchResults);}

      if (data.url.includes("example.org")) {
        return new Response("private upstream body", { status: 503 });
      }

      return new Response("Verified retrieval of public webpage text");
    });
    const result = await new BrightDataResearchProvider(
      "key",
      "serp",
      "reader",
      transport,
    ).research("source reading problems");
    expect(result.status).toBe("partial");
    expect(result.requests).toBe(3);
    expect(result.sources[0].excerpt).toBeDefined();
    expect(result.sources[1].excerpt).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("private upstream body");
  });

  it("prefers real venue websites to social posts using one bounded follow-up search", async () => {
    let searchCalls = 0;
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.zone).toBe("serp");
      searchCalls++;
      const query = new URL(request.url).searchParams.get("q") || "";

      if (searchCalls === 1) {
        expect(query).toContain("board game cafes");

        return Response.json({
          organic: [
            {
              title: "Social clip",
              link: "https://www.tiktok.com/@games/video/123",
              description: "Watch clip",
            },
            {
              title: "Directory search",
              link: "https://www.yelp.com/search?find_desc=board+games",
              description: "See nearby",
            },
          ],
        });
      }

      expect(query).toContain("-site:tiktok.com");

      return Response.json({
        organic: [
          {
            title: "Actual venue",
            link: "https://example.com/venue",
            description: "Games and snacks",
            image_url: "https://images.example.com/venue.jpg",
          },
          {
            title: "Another venue",
            link: "https://example.org/game-cafe",
            description: "Open for games",
          },
        ],
      });
    });
    const provider = new BrightDataResearchProvider(
      "key",
      "serp",
      "",
      transport,
    );
    const result = await provider.research("board game cafes in New York");
    expect(result.status).toBe("partial");
    expect(result.requests).toBe(2);
    expect(searchCalls).toBe(2);
    expect(result.sources[0].url).toBe("https://example.com/venue");
    expect(result.sources[0].imageUrl).toBe(
      "https://images.example.com/venue.jpg",
    );
    expect(result.sources[1].url).toBe("https://example.org/game-cafe");
    expect(result.sources.some((x) => x.url.includes("tiktok.com"))).toBe(true);
  });

  it("accepts full-JSON SERP responses with inline image payloads above 150 KB", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.format).toBe("json");
      expect(request.data_format).toBe("parsed");

      return Response.json({
        status_code: 200,
        body: JSON.stringify({
          organic: [
            {
              title: "Real result",
              link: "https://example.com/venue",
              description: "An actual source",
              image: "data:image/jpeg;base64," + "A".repeat(200_000),
            },
          ],
        }),
      });
    });
    const result = await new BrightDataResearchProvider(
      "test-secret",
      "gor_serp",
      "",
      transport,
    ).research("board game cafes New York");
    expect(result.status).toBe("partial");
    expect(result.sources[0].url).toBe("https://example.com/venue");
    expect(result.sources[0].imageUrl).toBeUndefined();
    expect(result.requests).toBe(2);
  });

  it("provides a single, agent-requested follow-up SERP call without auto page reads", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.format).toBe("json");
      expect(request.data_format).toBe("parsed");
      return Response.json({ organic: [
        { title: "A directory", link: "https://www.reddit.com/r/travel", description: "community" },
      ] });
    });
    const provider = new BrightDataResearchProvider("key", "gor_serp", "reader", transport);
    const result = await provider.searchOnce("board game cafes NYC");
    expect(result.requests).toBe(1);
    expect(result.sources).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("bounds agent-selected page reading and rejects indirect sources", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.url).toBe("https://example.org/official");
      expect(request.zone).toBe("reader");
      expect(request.data_format).toBe("markdown");
      return new Response("# Venue details");
    });
    const provider = new BrightDataResearchProvider("key", "gor_serp", "reader", transport);
    expect((await provider.readSource("https://www.google.com/goto?url=bad")).status).toBe("blocked");
    expect((await provider.readSource("http://127.0.0.1/admin")).status).toBe("blocked");
    expect(transport).not.toHaveBeenCalled();
    const read = await provider.readSource("https://example.org/official");
    expect(read).toMatchObject({ status: "ok", requests: 1, excerpt: "# Venue details" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("does not invent sources after malformed JSON or HTTP failures", async () => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response("access-denied secret", { status: 429 }),
    );
    const result = await new BrightDataResearchProvider(
      "key",
      "serp",
      "reader",
      transport,
    ).research("current research task");
    expect(result).toMatchObject({
      status: "error",
      sources: [],
      requests: 1,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

it("keeps valid search results when a rich result has a null snippet or image object", async () => {
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({
      organic: [
        {
          title: "Source with image",
          link: "https://example.com/real",
          description: null,
          image: { url: "https://example.com/photo.jpg" },
        },
        { title: null, link: "https://example.com/malformed" },
        {
          title: "Second source",
          link: "https://example.org/real",
          description: "Useful source preview",
        },
      ],
    }),
  );
  const result = await new BrightDataResearchProvider(
    "test-secret",
    "serp",
    "",
    transport,
  ).research("current culture research");
  expect(result.sources).toHaveLength(2);
  expect(result.sources[0]).toMatchObject({
    snippet: "",
    imageUrl: "https://example.com/photo.jpg",
  });
});
