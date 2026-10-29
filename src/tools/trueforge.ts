/**
 * Optional headless TrueForge integration.
 * Wire contract: https://github.com/truefoundry/trueforge/tree/main/docs/api
 * MIT upstream; this file is an Igor-authored HTTP adapter, not copied SDK code.
 *
 * TrueForge is a delegated execution harness, NOT Qloo evidence. Its text is
 * unverified until Igor independently obtains and validates corresponding
 * evidence. No URLs, tools, session IDs, or agent names are model-controlled.
 */
type TrueForgeEvent = {
  type?: string;
  thread_id?: string | null;
  content?: string | null;
  state?: {
    status?: string;
    output?: { content?: string | null } | null;
    required_actions?: unknown[];
  };
};

export type TrueForgeConfig = {
  baseUrl: string;
  agentName: string;
  token?: string;
};

export type TrueForgeReview = {
  sessionId: string;
  text: string;
  requests: number;
};

const MAX_RESPONSE_BYTES = 256_000;
const MAX_OBJECTIVE = 1200;
const MAX_RESPONSE_TEXT = 2400;

export function trueForgeConfig(
  env: Record<string, string | undefined> = process.env,
): TrueForgeConfig | null {
  if (env.IGOR_TRUEFORGE_ENABLED !== "1") {
    return null;
  }

  const name = env.TRUEFORGE_AGENT_NAME?.trim() ?? "";
  const url = env.TRUEFORGE_BASE_URL?.trim() ?? "";

  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(name)) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // No model-controlled hosts or credentials. Private network names require
  // HTTPS; local development can use the standalone loopback server.
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);

  if (
    (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/" ||
    url.length > 240
  ) {
    return null;
  }

  // TrueForge's no-auth local server is only safe on loopback.
  const token = env.TRUEFORGE_TOKEN?.trim();

  if (!local && !token) {
    return null;
  }

  return {
    baseUrl: parsed.origin,
    agentName: name,
    token,
  };
}

async function request(
  config: TrueForgeConfig,
  path: string,
  payload: unknown,
  http: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  const res = await http(`${config.baseUrl}/api/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal,
    redirect: "error",
  });

  if (!res.ok) {
    throw new Error(`TrueForge request failed (${res.status})`);
  }

  return res;
}

function parseTurnFrame(frame: string): TrueForgeEvent | null {
  const lines = frame.replace(/\r/g, "").split("\n");
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data || data === "[DONE]") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(data);

    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null;
    }

    return parsed as TrueForgeEvent;
  } catch {
    throw new Error("Invalid TrueForge event frame");
  }
}

export async function readTrueForgeTurn(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error("TrueForge stream missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  let partial = "";
  const terminalEvents: TrueForgeEvent[] = [];

  const consume = (frame: string) => {
    const event = parseTurnFrame(frame);

    if (!event) {
      return;
    }

    if (event.type === "model.message.delta" && event.thread_id === "main") {
      partial = (partial + (event.content ?? "")).slice(0, MAX_RESPONSE_TEXT);
    } else if (event.type === "turn.done") {
      terminalEvents.push(event);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      bytes += value.byteLength;

      if (bytes > MAX_RESPONSE_BYTES) {
        throw new Error("TrueForge response exceeded limit");
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let end: number;

      while ((end = buffer.indexOf("\n\n")) >= 0) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      consume(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  const final = terminalEvents.at(-1);

  if (final?.state?.status !== "done") {
    throw new Error("TrueForge turn did not complete");
  }

  if (final.state.required_actions?.length) {
    // Never silently approve tools or proceed through an auth challenge.
    throw new Error("TrueForge turn paused for approval");
  }

  const answer = (final.state.output?.content || partial).trim();

  if (!answer) {
    throw new Error("TrueForge returned no completed answer");
  }

  return answer.slice(0, MAX_RESPONSE_TEXT);
}

/** One session per saved Igor task; only commit its id after a completed turn. */
export async function consultTrueForge(
  config: TrueForgeConfig,
  objective: string,
  previousSessionId?: string,
  http: typeof fetch = fetch,
): Promise<TrueForgeReview> {
  const trimmed = objective.trim();

  if (!trimmed || trimmed.length > MAX_OBJECTIVE) {
    throw new Error("TrueForge objective is invalid");
  }

  if (previousSessionId && !/^[a-zA-Z0-9_-]{1,160}$/.test(previousSessionId)) {
    throw new Error("TrueForge session id is invalid");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14_000);

  try {
    let sessionId = previousSessionId;
    let requests = 0;

    if (!sessionId) {
      requests++;
      const response = await request(
        config,
        "sessions",
        { agent: { name: config.agentName } },
        http,
        controller.signal,
      );
      const data: unknown = await response.json();

      const candidate =
        data && typeof data === "object" && "data" in data
          ? (data as { data?: { id?: unknown } }).data?.id
          : undefined;

      if (typeof candidate !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(candidate)) {
        throw new Error("TrueForge session creation returned an invalid id");
      }

      sessionId = candidate;
    }

    requests++;
    const stream = await request(
      config,
      `sessions/${encodeURIComponent(sessionId)}/turns`,
      { input: [{ type: "user.message", content: trimmed }] },
      http,
      controller.signal,
    );
    const text = await readTrueForgeTurn(stream);

    return { sessionId, text, requests };
  } finally {
    clearTimeout(timeout);
  }
}
