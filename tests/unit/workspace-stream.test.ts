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
      expect(event.message).toBe("Discovering");
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
