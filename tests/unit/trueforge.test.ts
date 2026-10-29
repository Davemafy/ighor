import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consultTrueForge,
  readTrueForgeTurn,
  trueForgeConfig,
} from "../../src/tools/trueforge";

const config = {
  baseUrl: "http://localhost:8790",
  agentName: "igor-delegate",
};

const successfulStream = [
  'data: {"type":"turn.created","thread_id":null}',
  'data: {"type":"model.message.delta","thread_id":"main","content":"An observed "}',
  'data: {"type":"model.message.delta","thread_id":"subagent-1","content":"Do not include this"}',
  'data: {"type":"model.message.delta","thread_id":"main","content":"candidate."}',
  'data: {"type":"turn.done","state":{"status":"done","output":{"content":"An observed candidate."},"required_actions":[]}}',
  "",
  "",
].join("\n");

function turn(body = successfulStream) {
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("TrueForge opt-in safety boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is unavailable unless explicitly enabled with an agent and safe origin", () => {
    expect(trueForgeConfig({ TRUEFORGE_BASE_URL: "http://localhost:8790" })).toBeNull();
    expect(
      trueForgeConfig({
        IGOR_TRUEFORGE_ENABLED: "1",
        TRUEFORGE_BASE_URL: "http://169.254.169.254/latest/meta-data",
        TRUEFORGE_AGENT_NAME: "delegate",
      }),
    ).toBeNull();
    expect(
      trueForgeConfig({
        IGOR_TRUEFORGE_ENABLED: "1",
        TRUEFORGE_BASE_URL: "https://remote.example",
        TRUEFORGE_AGENT_NAME: "delegate",
      }),
    ).toBeNull();
    expect(
      trueForgeConfig({
        IGOR_TRUEFORGE_ENABLED: "1",
        TRUEFORGE_BASE_URL: "http://127.0.0.1:8790",
        TRUEFORGE_AGENT_NAME: "delegate",
      }),
    ).toMatchObject({ baseUrl: "http://127.0.0.1:8790" });
  });

  it("requires authorization for remote servers and never accepts URL credentials", () => {
    expect(
      trueForgeConfig({
        IGOR_TRUEFORGE_ENABLED: "1",
        TRUEFORGE_BASE_URL: "https://example.org",
        TRUEFORGE_AGENT_NAME: "igor_delegate",
        TRUEFORGE_TOKEN: "server-secret",
      }),
    ).toMatchObject({
      baseUrl: "https://example.org",
      agentName: "igor_delegate",
      token: "server-secret",
    });
    expect(
      trueForgeConfig({
        IGOR_TRUEFORGE_ENABLED: "1",
        TRUEFORGE_BASE_URL: "https://username:secret@example.org/",
        TRUEFORGE_AGENT_NAME: "delegate",
        TRUEFORGE_TOKEN: "token",
      }),
    ).toBeNull();
  });

  it("creates a TrueForge session and streams a completed turn using the official HTTP path", async () => {
    const http = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "http://localhost:8790/api/v1/sessions") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          agent: { name: "igor-delegate" },
        });

        return Response.json({ data: { id: "sess_123" } });
      }

      expect(url).toBe("http://localhost:8790/api/v1/sessions/sess_123/turns");
      expect(JSON.parse(String(init?.body))).toEqual({
        input: [{ type: "user.message", content: "Compare these plans" }],
      });

      return turn();
    });
    const result = await consultTrueForge(
      config,
      "Compare these plans",
      undefined,
      http as typeof fetch,
    );

    expect(result).toEqual({
      sessionId: "sess_123",
      text: "An observed candidate.",
      requests: 2,
    });
    expect(http).toHaveBeenCalledTimes(2);
  });

  it("reuses the existing session instead of creating a new conversation", async () => {
    const http = vi.fn(async (_url: string) => turn());
    const result = await consultTrueForge(
      config,
      "Review a follow-up",
      "sess_123",
      http as typeof fetch,
    );

    expect(result.requests).toBe(1);
    expect(result.sessionId).toBe("sess_123");
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0]?.[0]).toContain("/sessions/sess_123/turns");
  });

  it("fails closed on approval pauses, errors, absent completion, and invalid session ids", async () => {
    const pause = turn(
      'data: {"type":"turn.done","state":{"status":"done","output":null,"required_actions":[{"type":"tool.approval_required"}]}}\n\n',
    );

    await expect(readTrueForgeTurn(pause)).rejects.toThrow("paused for approval");
    await expect(
      readTrueForgeTurn(turn('data: {"type":"turn.done","state":{"status":"error"}}\n\n')),
    ).rejects.toThrow("did not complete");
    await expect(readTrueForgeTurn(turn("data: {}\n\n"))).rejects.toThrow("did not complete");
    await expect(
      consultTrueForge(config, "A bounded objective", "../outside", vi.fn() as typeof fetch),
    ).rejects.toThrow("session id is invalid");
  });

  it("caps streaming content and never treats a subagent delta as main output", async () => {
    const answer = await readTrueForgeTurn(
      turn([
        'data: {"type":"model.message.delta","thread_id":"main","content":"Validated placeholder"}',
        'data: {"type":"model.message.delta","thread_id":"subagent-2","content":"Bad output"}',
        'data: {"type":"turn.done","state":{"status":"done","output":null,"required_actions":[]}}',
        "",
        "",
      ].join("\n")),
    );

    expect(answer).toBe("Validated placeholder");
  });
});
