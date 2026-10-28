"use client";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/** Real result entrances only; no scrolling takeover inside the workspace. */
export function EditorialMotion() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = marker.current?.closest<HTMLElement>(".iw-app");

    if (!root) {
      return;
    }

    const seen = new WeakSet<Element>();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const context = gsap.context(() => {}, root);

    const reveal = () => {
      const elements = Array.from(
        root.querySelectorAll(
          ".iw-ideas > button, .iw-references > article, .ic-discoveries > article, .iw-inline-output .ic-document",
        ),
      );
      const fresh = elements.filter((element) => !seen.has(element));
      fresh.forEach((element) => seen.add(element));

      if (!fresh.length || reduced.matches || root.dataset.motion === "off") {
        return;
      }

      context.add(() =>
        gsap.from(fresh, {
          y: 18,
          rotation: (index) => (index % 2 ? 1.4 : -1.4),
          opacity: 0.15,
          duration: 0.65,
          stagger: 0.075,
          ease: "power3.out",
          clearProps: "transform,opacity",
        }),
      );
    };

    reveal();
    const observer = new MutationObserver(reveal);
    observer.observe(root, { childList: true, subtree: true });
    const settings = new MutationObserver(() => {
      if (root.dataset.motion === "off") {
        context.revert();
      }
    });
    settings.observe(root, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });

    const change = () => {
      if (reduced.matches) {
        context.revert();
      }
    };

    reduced.addEventListener("change", change);

    return () => {
      observer.disconnect();
      settings.disconnect();
      reduced.removeEventListener("change", change);
      context.revert();
    };
  }, []);

  return <span ref={marker} hidden aria-hidden="true" />;
}
