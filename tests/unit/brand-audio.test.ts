import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrandAudio } from "../../src/lib/brand-audio";

const oscillator = () => ({
  type: "",
  frequency: { value: 0 },
  detune: { value: 0 },
  connect: vi.fn(),
  disconnect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  onended: null,
});
const context = () => ({
  currentTime: 0,
  destination: {},
  resume: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  createOscillator: vi.fn(oscillator),
  createGain: vi.fn(() => ({
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
});
let current: ReturnType<typeof context>;
let doc: EventTarget & { hidden: boolean };
beforeEach(() => {
  vi.useFakeTimers();
  current = context();
  doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return current;
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("starts silent and schedules original chords only after explicit start", async () => {
  const score = new BrandAudio();
  expect(score.playing).toBe(false);
  expect(current.createOscillator).not.toHaveBeenCalled();
  await score.start();
  expect(score.playing).toBe(true);
  expect(current.createOscillator).toHaveBeenCalledTimes(4);
  vi.advanceTimersByTime(8000);
  expect(current.createOscillator).toHaveBeenCalledTimes(8);
  score.dispose();
});
it("stops on backgrounding and never silently resumes", async () => {
  const changed = vi.fn();
  const score = new BrandAudio(changed);
  await score.start();
  doc.hidden = true;
  doc.dispatchEvent(new Event("visibilitychange"));
  expect(current.close).toHaveBeenCalledOnce();
  expect(score.playing).toBe(false);
  vi.advanceTimersByTime(16000);
  expect(current.createOscillator).toHaveBeenCalledTimes(4);
  doc.hidden = false;
  doc.dispatchEvent(new Event("visibilitychange"));
  expect(score.playing).toBe(false);
  expect(changed).toHaveBeenLastCalledWith(false);
  score.dispose();
});
it("closes the audio context when the page is left", async () => {
  const score = new BrandAudio();
  await score.start();
  window.dispatchEvent(new Event("pagehide"));
  expect(score.playing).toBe(false);
  score.dispose();
});
it("recovers from browser audio rejection without leaving a running timer", async () => {
  current.resume.mockRejectedValueOnce(new Error("blocked"));
  const score = new BrandAudio();
  await expect(score.start()).rejects.toThrow("Sound is unavailable");
  expect(score.playing).toBe(false);
  expect(current.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  score.dispose();
});
