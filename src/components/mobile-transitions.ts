"use client";

import { flushSync } from "react-dom";

/**
 * Match a result card to its expanded surface when the browser supports
 * native view transitions. Preserve immediate state changes on older devices
 * and for people who prefer reduced motion.
 */
export function morphLayout(update: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const browser = document as Document & {
    startViewTransition?: (callback: () => void) => unknown;
  };
  if (reduced || !browser.startViewTransition) {
    update();
    return;
  }

  browser.startViewTransition(() => flushSync(update));
}
