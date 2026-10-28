"use client";

import { flushSync } from "react-dom";

type Transition = { finished: Promise<void>; skipTransition: () => void };
let active: Transition | undefined;
let generation = 0;

export function isMorphing() {
  return !!active;
}

/** Server-backed updates share one transition. Newer snapshots supersede older animation. */
export function morphLayout(update: () => void) {
  const currentGeneration = ++generation;
  const browser = document as Document & {
    startViewTransition?: (callback: () => void) => Transition;
  };

  if (
    document.querySelector?.("[data-igor-motion]") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !browser.startViewTransition
  ) {
    update();

    return;
  }

  active?.skipTransition();
  let committed = false;

  try {
    const transition = browser.startViewTransition(() =>
      flushSync(() => {
        if (currentGeneration !== generation) {
          return;
        }

        committed = true;
        update();
      }),
    );
    active = transition;
    void transition.finished
      .catch(() => {})
      .finally(() => {
        if (active === transition) {
          active = undefined;
        }
      });
  } catch (error) {
    if (!committed) {
      update();
    } else {
      throw error;
    }
  }
}
