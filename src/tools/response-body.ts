export class ResponseBodyError extends Error {
  constructor(readonly reason: "missing" | "too-large") {
    super(
      reason === "missing"
        ? "Response body missing."
        : "Response exceeds byte limit.",
    );
  }
}

/** Count streamed bytes even when Content-Length is absent or incorrect. */
export async function readResponseText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new ResponseBodyError("missing");
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      receivedBytes += value.byteLength;

      if (receivedBytes > maxBytes) {
        await reader.cancel();
        throw new ResponseBodyError("too-large");
      }

      chunks.push(value);
    }

    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}

export async function readModelResponse(response: Response): Promise<string> {
  try {
    return await readResponseText(response, 100000);
  } catch (error) {
    if (error instanceof ResponseBodyError) {
      throw new Error(
        error.reason === "missing"
          ? "Missing model response body."
          : "Oversized model response.",
      );
    }

    throw error;
  }
}
