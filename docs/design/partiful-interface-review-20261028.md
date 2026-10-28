# Igor interface review — 28 October 2026

Reviewed the supplied 87.7-second recording throughout at one-second intervals, including the outing submission (7–11s), retry (18–25s), research fallback (47–52s), expanded tool activity (66–77s), and failed image followup (78–87s).

## Observed failures

- An outing with dining and board games renders generic loading lines. The old loader only detects a small set of keywords in the current message; it ignores prior intent.
- The response reports repeated search failures, then provides search snippets and URLs rather than a verified comparison. A visual redesign does not resolve that provider/integration failure.
- A draft repeats the reference dump; raw event names consume the result surface.
- Requests for images fail without yielding any visual choices. Brand artwork must never be presented as retrieved venue photography.

## Public Partiful pages inspected

- https://partiful.com/ — contained navigation, decisive headline, one primary action and a single dominant photographic composition, with staged message overlays.
- https://partiful.com/explore/nyc — image-led event cards, a compact title/detail hierarchy, sections that make browsing legible, restrained controls.
- https://partiful.com/e/B9X0Wtx8YG2XNpRb6Teh?source=discover — large artwork and title, distinct date/time/location groups, supporting host information, a prominent next action, and a material background that belongs to the event.

These are observed composition patterns, not permission to reuse Partiful's logo, posters, event photography, or proprietary code. Igor keeps its own artwork, mark, light palette and Archivo typography.

## Implementation in this pass

- All message sends use three small decorative brand-art postcards rather than two anonymous bars. Film/music context uses square sleeves; outings and other work use landscape cards.
- Short followups inherit recent user intent. A named new domain overrides the prior one. This only selects loading artwork, never server routing.
- The three cards gently lift and rotate with staggered motion, fixed reserved space, and support for both reduced-motion and Igor's motion-off setting.
- The activity node starts collapsed so a useful deliverable receives attention before technical trace details.

## Next acceptance bar for research results

One compact explanation; a small set of real candidate/source cards; a clear comparison based on retrieved facts; unknown practical details labelled next to the affected option; one meaningful next action. Source titles should be linked and readable rather than expanded raw URL paragraphs. Logs belong in a collapsed disclosure. Do not add stock images to imply that a failed venue lookup succeeded. The engine branch must return structured, source-grounded results before the UI can meet this bar.
