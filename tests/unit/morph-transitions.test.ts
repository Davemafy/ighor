import { afterEach, expect, it, vi } from "vitest";
import {
  isMorphing,
  morphLayout,
} from "../../src/components/mobile-transitions";
afterEach(() => vi.unstubAllGlobals());

function environment(
  reduced: boolean,
  start?: (callback: () => void) => unknown,
) {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: reduced }) });
  vi.stubGlobal("document", { startViewTransition: start });
}

it("updates immediately with reduced motion and without the native transition API", () => {
  const update = vi.fn();
  const start = vi.fn();
  environment(true, start);
  morphLayout(update);
  expect(update).toHaveBeenCalledTimes(1);
  expect(start).not.toHaveBeenCalled();
  environment(false);
  morphLayout(update);
  expect(update).toHaveBeenCalledTimes(2);
});
it("keeps the latest transition active when an older animation finishes", async () => {
  const finish: (() => void)[] = [];
  const skips = [vi.fn(), vi.fn()];
  let index = 0;
  environment(false, (callback) => {
    callback();
    const own = index++;

    return {
      finished: new Promise<void>((resolve) => finish.push(resolve)),
      skipTransition: skips[own],
    };
  });
  const update = vi.fn();
  morphLayout(update);
  morphLayout(update);
  expect(update).toHaveBeenCalledTimes(2);
  expect(skips[0]).toHaveBeenCalledOnce();
  expect(isMorphing()).toBe(true);
  finish[0]();
  await Promise.resolve();
  await Promise.resolve();
  expect(isMorphing()).toBe(true);
  finish[1]();
  await Promise.resolve();
  await Promise.resolve();
  expect(isMorphing()).toBe(false);
});
it("does not let a delayed old snapshot overwrite the latest state", async () => {
  const callbacks: (() => void)[] = [];
  const finish: (() => void)[] = [];
  environment(false, (callback) => {
    callbacks.push(callback);

    return {
      finished: new Promise<void>((resolve) => finish.push(resolve)),
      skipTransition: vi.fn(),
    };
  });
  let state = 0;
  morphLayout(() => {
    state = 1;
  });
  morphLayout(() => {
    state = 2;
  });
  callbacks[1]();
  callbacks[0]();
  expect(state).toBe(2);
  finish.forEach((resolve) => resolve());
  await Promise.resolve();
  await Promise.resolve();
});
it("falls back if capture fails before applying the update", () => {
  environment(false, () => {
    throw Error("Snapshot unavailable");
  });
  const update = vi.fn();
  morphLayout(update);
  expect(update).toHaveBeenCalledOnce();
});
