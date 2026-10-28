"use client";
import { useEffect, useRef, useState } from "react";
import { BrandAudio } from "@/lib/brand-audio";

export function SoundControl() {
  const audio = useRef<BrandAudio | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const score = new BrandAudio(setPlaying);
    audio.current = score;

    return () => {
      score.dispose();
      audio.current = null;
    };
  }, []);

  return (
    <button
      className="iw-sound-control"
      type="button"
      aria-pressed={playing}
      aria-label={
        error || (playing ? "Turn studio sound off" : "Turn studio sound on")
      }
      title={error || "Original ambient studio sound. Off until you choose."}
      onClick={async () => {
        if (audio.current?.playing) {
          audio.current.stop();

          return;
        }

        try {
          await audio.current?.start();
          setError("");
        } catch {
          setError("Sound is unavailable in this browser.");
        }
      }}
    >
      <span className="iw-sound-bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>
        {error ? "Sound unavailable" : playing ? "Sound on" : "Sound off"}
      </span>
    </button>
  );
}
