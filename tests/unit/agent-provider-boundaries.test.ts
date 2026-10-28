import { describe, expect, it, vi } from "vitest";
import { GooglePlacesProvider } from "../../src/tools/google-maps";
import { BrowserbaseObserver } from "../../src/tools/browserbase-observer";
import { createAgentToolRegistry } from "../../src/core/agent-tool-registry";
import { freshTask } from "../../src/data/fixtures";

describe("real provider boundaries (mock transport, never labeled LIVE)", () => {
  it("uses Google Places (New) with minimal field masks and preserves actual coordinates", async () => {
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string,string>;
      expect(headers["X-Goog-Api-Key"]).toBe("private-test-key");
      expect(headers["X-Goog-FieldMask"]).toContain("places.formattedAddress");
      expect(headers["X-Goog-FieldMask"]).not.toContain("*");
      expect(JSON.parse(String(init?.body)).pageSize).toBe(5);
      return Response.json({ places: [{
        id: "known-id", displayName: { text: "Real returned venue" },
        formattedAddress: "Berlin, Germany",
        googleMapsUri: "https://maps.google.com/?cid=12345",
        location: { latitude: 52.52, longitude: 13.405 },
      }] });
    });
    const result = await new GooglePlacesProvider("private-test-key",transport).search("Berlin listening bars");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.places[0]).toMatchObject({
        name: "Real returned venue", latitude: 52.52, longitude: 13.405,
      });
    }
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("never invents Places results on missing credentials or a provider error", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response("secret upstream", {status: 403}));
    expect((await new GooglePlacesProvider("",transport).search("Berlin venues")).status).toBe("blocked");
    const failed = await new GooglePlacesProvider("test-key",transport).search("Berlin venues");
    expect(failed).toMatchObject({status:"error", places: [], requests:1});
    expect(JSON.stringify(failed)).not.toContain("secret upstream");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rejects browser navigation to unsafe targets before allocating a paid session", async () => {
    const transport = vi.fn<typeof fetch>();
    const browser = new BrowserbaseObserver("test-key","test-project",transport);
    expect((await browser.observe("http://localhost/admin")).status).toBe("blocked");
    expect((await browser.observe("https://www.google.com/goto?url=x")).status).toBe("blocked");
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not expose a browser tool when no Browserbase provider is attached", () => {
    const tools = createAgentToolRegistry({
      task:freshTask("t","owner"),
      research: { async research(){return {status:"blocked" as const,sources:[],requests:0}} },
      sources:[],runId:"test-run",
    });
    expect(tools.find((tool)=>tool.name==="browser.observe")?.available).toBe(false);
    expect(tools.find((tool)=>tool.name==="places.search")?.available).toBe(false);
    expect(tools.some((tool)=>tool.name==="qloo.resolve_entity")).toBe(true);
  });
});
