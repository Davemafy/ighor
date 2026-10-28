/** Original, synthesized ambient score. No recording, tracking or remote audio. */
export class BrandAudio {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private disposed = false;
  private visibility = () => {
    if (document.hidden) {
      this.stop();
    }
  };
  private pageHide = () => this.stop();
  constructor(private changed: (playing: boolean) => void = () => {}) {
    document.addEventListener("visibilitychange", this.visibility);
    window.addEventListener("pagehide", this.pageHide);
  }
  get playing() {
    return this.context !== null;
  }
  async start() {
    if (this.context || this.disposed) {
      return;
    }

    const context = new AudioContext();
    this.context = context;

    try {
      await context.resume();

      if (this.context !== context || document.hidden) {
        this.stop();

        return;
      }

      this.step = 0;
      this.chord();
      this.timer = setInterval(() => this.chord(), 8000);
      this.changed(true);
    } catch {
      this.stop();
      throw new Error("Sound is unavailable in this browser.");
    }
  }
  private chord() {
    const context = this.context;

    if (!context) {
      return;
    }

    const chords = [
      [146.83, 220, 261.63, 329.63],
      [130.81, 196, 246.94, 293.66],
      [110, 164.81, 220, 261.63],
      [130.81, 174.61, 220, 261.63],
    ];
    const notes = chords[this.step++ % chords.length];
    const start = context.currentTime + 0.04;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index % 2 ? 3 : -3;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.012, start + 1.7);
      gain.gain.linearRampToValueAtTime(0.007, start + 5);
      gain.gain.linearRampToValueAtTime(0, start + 8.1);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + index * 0.045);
      oscillator.stop(start + 8.2);

      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
  }
  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
    }

    this.timer = null;
    const context = this.context;
    this.context = null;
    void context?.close().catch(() => {});
    this.changed(false);
  }
  dispose() {
    this.disposed = true;
    this.stop();
    document.removeEventListener("visibilitychange", this.visibility);
    window.removeEventListener("pagehide", this.pageHide);
  }
}
