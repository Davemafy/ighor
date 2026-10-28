import { BrandAudio } from "/marketing/vendor/brand-audio.js";

const soundButton = document.querySelector("#brand-sound");
const audio = new BrandAudio((playing) => {
  soundButton?.setAttribute("aria-pressed", String(playing));
  soundButton?.setAttribute(
    "aria-label",
    playing ? "Turn studio sound off" : "Turn studio sound on",
  );
  if (soundButton)
    soundButton.lastElementChild.textContent = playing
      ? "Sound on"
      : "Sound off";
});
soundButton?.addEventListener("click", async () => {
  if (audio.playing) {
    audio.stop();
    return;
  }
  try {
    await audio.start();
  } catch {
    soundButton.lastElementChild.textContent = "Sound unavailable";
  }
});
window.addEventListener("pagehide", () => audio.dispose(), { once: true });

const { gsap, ScrollTrigger, Lenis } = window;
if (gsap && ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  media.add("(prefers-reduced-motion: no-preference)", () => {
    let lenis;
    let tick;
    // The marketing document scrolls; the product's independent panes remain native.
    if (Lenis && matchMedia("(min-width: 900px) and (pointer: fine)").matches) {
      lenis = new Lenis({
        duration: 1.05,
        smoothWheel: true,
        anchors: true,
        prevent: (node) =>
          Boolean(
            node.closest(
              "dialog, .workspace, .mega-panel, .outcome-rail, [data-lenis-prevent]",
            ),
          ),
      });
      lenis.on("scroll", ScrollTrigger.update);
      tick = (time) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
    }
    gsap.from(".hero-copy h1", {
      y: 44,
      opacity: 0.2,
      duration: 1.1,
      ease: "power3.out",
      clearProps: "transform,opacity",
    });
    gsap.from(".hero-photo", {
      rotation: -7,
      y: 40,
      duration: 1.35,
      ease: "power3.out",
      clearProps: "transform",
    });
    document
      .querySelectorAll(
        ".center-heading h2, .wave-heading h2, .goal-explorer h2, .workspace-heading h2, .revision-copy h2, .outcome-stories h2",
      )
      .forEach((heading) => {
        gsap.from(heading, {
          y: 42,
          opacity: 0.25,
          duration: 0.85,
          ease: "power3.out",
          clearProps: "transform,opacity",
          scrollTrigger: { trigger: heading, start: "top 94%", once: true },
        });
      });
    gsap.utils.toArray(".steps .step").forEach((card, index) => {
      gsap.from(card, {
        y: 40,
        rotation: index % 2 ? 2 : -2,
        opacity: 0.25,
        duration: 0.8,
        delay: index * 0.08,
        ease: "power3.out",
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: card, start: "top 94%", once: true },
      });
    });
    gsap.fromTo(
      ".hero-photo .dinner",
      { yPercent: -3, scale: 1.08 },
      {
        yPercent: 5,
        scale: 1.08,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          scrub: 1,
        },
      },
    );
    return () => {
      if (tick) gsap.ticker.remove(tick);
      lenis?.destroy();
    };
  });
  window.addEventListener("pagehide", () => media.revert(), { once: true });
  document.fonts.ready.then(() => ScrollTrigger.refresh());
}
