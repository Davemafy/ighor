import { afterEach, expect, it, vi } from "vitest";
import { fetchWorkspace } from "../../src/components/workspace-api";

afterEach(() => vi.unstubAllGlobals());

it.each([401, 404])(
  "allows a fresh workspace after an inaccessible saved task (%s)",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status })),
    );
    await expect(fetchWorkspace("saved-task")).resolves.toBeNull();
  },
);

it("surfaces server failure instead of replacing a saved workspace", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
  );
  await expect(fetchWorkspace("saved-task")).rejects.toThrow(
    "Could not load workspace",
  );
});
