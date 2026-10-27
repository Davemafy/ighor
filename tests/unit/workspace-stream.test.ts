import { describe, expect, it } from "vitest";
import { readTurnEvents } from "../../src/components/workspace-api";

function streamedResponse(chunks: Uint8Array[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }

        controller.close();
      },
    }),
  );
}

describe("Workspace execution stream", () => {
  it("preserves events and Unicode when network chunks split every byte", async () => {
    const bytes = new TextEncoder().encode(
      ': heartbeat\n\ndata: {"type":"action","message":"Finding café references 🎵"}\n\ndata: {"type":"error","code":"conflict","message":"Reload"}\n\n',
    );
    const response = streamedResponse(
      Array.from(bytes, (byte) => Uint8Array.of(byte)),
    );
    const events = [];

    for await (const event of readTurnEvents(response)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "action", message: "Finding café references 🎵" },
      { type: "error", code: "conflict", message: "Reload" },
    ]);
    expect(response.body?.locked).toBe(false);
  });

  it("releases the stream when the consumer stops early", async () => {
    const response = streamedResponse([
      new TextEncoder().encode(
        'data: {"type":"action","message":"Discovering"}\n\ndata: {"type":"done"}\n\n',
      ),
    ]);

    for await (const event of readTurnEvents(response)) {
      expect(event.type === "action" && event.message).toBe("Discovering");
      break;
    }

    expect(response.body?.locked).toBe(false);
  });

  it("rejects malformed events and still releases the stream", async () => {
    const response = streamedResponse([
      new TextEncoder().encode("data: invalid-json\n\n"),
    ]);
    const events = readTurnEvents(response);
    await expect(events.next()).rejects.toThrow();
    expect(response.body?.locked).toBe(false);
  });

  it("reports a missing response body", async () => {
    const events = readTurnEvents(new Response(null));
    await expect(events.next()).rejects.toThrow(
      "No execution stream received.",
    );
  });
});

it("rejects schema-invalid events and cancels the response", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"done"}\n\n'),
        );
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await expect(readTurnEvents(response).next()).rejects.toThrow();
  expect(cancelled).toBe(true);
  expect(response.body?.locked).toBe(false);
});

it("reports a dropped connection instead of implying completion", async () => {
  const response = streamedResponse([
    new TextEncoder().encode('data: {"type":"action","message":"Working"}\n\n'),
  ]);
  const events = readTurnEvents(response);
  expect((await events.next()).value).toEqual({
    type: "action",
    message: "Working",
  });
  await expect(events.next()).rejects.toThrow("ended before completion");
});

it("times out an idle connection and cancels its reader", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  await expect(readTurnEvents(response, 15).next()).rejects.toThrow(
    "connection stopped responding",
  );
  expect(cancelled).toBe(true);
  expect(response.body?.locked).toBe(false);
});

it("accepts CRLF packets and heartbeats split across network chunks", async () => {
  const bytes = new TextEncoder().encode(
    ': heartbeat\r\n\r\ndata: {"type":"action","message":"Working"}\r\n\r\ndata: {"type":"error","message":"Retry"}\r\n\r\n',
  );
  const response = streamedResponse(
    Array.from(bytes, (byte) => Uint8Array.of(byte)),
  );
  const events = [];

  for await (const event of readTurnEvents(response)) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual(["action", "error"]);
  expect(response.body?.locked).toBe(false);
});
