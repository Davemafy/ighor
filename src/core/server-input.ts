/** Enforce a byte bound even for chunked requests with no Content-Length. */
export async function readBoundedJson(
  request: Request,
  limit = 100000,
): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);

  if (!Number.isFinite(length) || length < 0 || length > limit) {
    throw new Error("Invalid request size.");
  }

  const reader = request.body?.getReader();

  if (!reader) {
    throw new Error("Request body required.");
  }

  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    while (true) {
      const part = await reader.read();

      if (part.done) {
        break;
      }

      bytes += part.value.byteLength;

      if (bytes > limit) {
        await reader.cancel();
        throw new Error("Request too large.");
      }

      chunks.push(part.value);
    }

    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}
