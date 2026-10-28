"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { isMorphing } from "./mobile-transitions";

/** One persistent work object: forms, comparisons, drafts and maps share its bounds. */
export function AdaptiveStage({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = outer.current;
    const content = inner.current;

    if (!frame || !content) {
      return;
    }

    let previous = content.getBoundingClientRect().height;
    let animation: Animation | undefined;

    const resize = () => {
      const next = content.getBoundingClientRect().height;
      const before = previous;
      previous = next;

      if (Math.abs(next - before) < 2) {
        return;
      }

      animation?.cancel();

      if (
        isMorphing() ||
        matchMedia("(prefers-reduced-motion: reduce)").matches ||
        !frame.animate
      ) {
        return;
      }

      animation = frame.animate(
        [{ height: `${before}px` }, { height: `${next}px` }],
        { duration: 480, easing: "cubic-bezier(.22,.8,.22,1)" },
      );
    };

    const observer = new ResizeObserver(resize);
    observer.observe(content);

    return () => {
      observer.disconnect();
      animation?.cancel();
    };
  }, []);

  return (
    <div
      ref={outer}
      className="iw-adaptive-stage"
      style={{ viewTransitionName: "igor-adaptive-stage" }}
    >
      <div ref={inner} className="iw-adaptive-content">
        {children}
      </div>
    </div>
  );
}
