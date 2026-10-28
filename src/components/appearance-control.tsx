"use client";

import { useEffect, useRef, useState } from "react";
import { Palette, X } from "lucide-react";
import { SoundControl } from "./sound-control";

const palettes = [
  { id: "aurora", label: "Aurora", colors: "#c5b6f4, #f5c7b6, #accdf1" },
  { id: "sunset", label: "Sunset", colors: "#f3b899, #ecc4d4, #ead69e" },
  { id: "tide", label: "Tide", colors: "#a9d9d2, #bfc9ee, #e3d6b7" },
  { id: "paper", label: "Paper", colors: "#f7f7f7, #efeee8" },
];

export function AppearanceControl() {
  const anchor = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState("aurora");
  const [motion, setMotion] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Hydrate browser preferences on the first frame after matching server markup.
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(
          localStorage.getItem("igor-appearance") || "null",
        );

        if (palettes.some((item) => item.id === saved?.palette)) {
          setPalette(saved.palette);
        }

        if (typeof saved?.motion === "boolean") {
          setMotion(saved.motion);
        }
      } catch {
        // Unavailable storage keeps the default appearance.
      }

      setLoaded(true);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const app = anchor.current?.closest<HTMLElement>(".iw-app");

    if (!app || !loaded) {
      return;
    }

    app.dataset.palette = palette;
    app.dataset.motion = motion ? "on" : "off";

    try {
      localStorage.setItem(
        "igor-appearance",
        JSON.stringify({ palette, motion }),
      );
    } catch {
      /* Session controls still work. */
    }
  }, [palette, motion, loaded]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !anchor.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", dismiss);

    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <div
      className="iw-appearance"
      ref={anchor}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          anchor.current
            ?.querySelector<HTMLButtonElement>(".iw-appearance-trigger")
            ?.focus();
        }
      }}
    >
      <SoundControl />
      <button
        className="iw-appearance-trigger"
        aria-expanded={open}
        aria-controls="igor-appearance-panel"
        onClick={() => setOpen(!open)}
      >
        <Palette size={18} />
        <span>Appearance</span>
      </button>
      {open && (
        <section
          id="igor-appearance-panel"
          className="iw-appearance-panel"
          aria-label="Appearance"
        >
          <header>
            <strong>Make it yours</strong>
            <button
              aria-label="Close appearance"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>
          <fieldset>
            <legend>Atmosphere</legend>
            <div className="iw-palette-options">
              {palettes.map((item) => (
                <label key={item.id}>
                  <input
                    type="radio"
                    name="igor-palette"
                    value={item.id}
                    checked={palette === item.id}
                    onChange={() => setPalette(item.id)}
                  />
                  <span
                    className="iw-palette-swatch"
                    style={{
                      background: `linear-gradient(135deg, ${item.colors})`,
                    }}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="iw-motion-control">
            <span>
              Gentle motion<small>Always respects reduced motion.</small>
            </span>
            <input
              type="checkbox"
              checked={motion}
              onChange={(event) => setMotion(event.target.checked)}
            />
          </label>
        </section>
      )}
    </div>
  );
}
