import { describe, expect, it } from "vitest";
import {
  readResponseText,
  readModelResponse,
  ResponseBodyError,
} from "../../src/tools/response-body";

describe("Provider response byte limits", () => {
  it("counts actual UTF-8 bytes across chunks instead of trusting headers", async () => {
    const bytes = new TextEncoder().encode("café 🎵");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) {
          controller.enqueue(Uint8Array.of(byte));
        }

        controller.close();
      },
    });
    const response = new Response(body, { headers: { "content-length": "1" } });
    await expect(readResponseText(response, bytes.length)).resolves.toBe(
      "café 🎵",
    );
    expect(response.body?.locked).toBe(false);
  });
  it("cancels an oversized stream and releases its reader", async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(6));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    await expect(readResponseText(response, 5)).rejects.toMatchObject({
      reason: "too-large",
    });
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  });
  it("releases a reader after a transport failure", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("connection lost"));
        },
      }),
    );
    await expect(readResponseText(response, 5)).rejects.toThrow(
      "connection lost",
    );
    expect(response.body?.locked).toBe(false);
  });
  it("preserves the model adapter's missing-body error", async () => {
    await expect(
      readResponseText(new Response(null), 5),
    ).rejects.toBeInstanceOf(ResponseBodyError);
    await expect(readModelResponse(new Response(null))).rejects.toThrow(
      "Missing model response body.",
    );
  });
});
