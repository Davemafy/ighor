# Discovery interface

The home and result experience lives in `src/components/discovery/`. `home.tsx` connects it to the existing workspace hook and server routes. The advanced workspace remains at `/workspace`.

## Foundations

The canvas is `#fafaf6`, the text is `#222421` and the primary action color is `#3e4ff0`. Bricolage Grotesque carries headings; DM Sans carries controls and body text. Both fonts are served locally from `public/fonts/` with their OFL license notices.

Partiful is the primary visual and interaction reference. Its live creation flow pairs an editable outcome with its preview, keeps optional details within reach and makes presentation part of creation. Igor should apply those principles to different kinds of outcomes. Its current interface has not yet met that reference bar. Do not copy Partiful assets or screens.

The Chicago starting-point photo is served from `public/images/chicago.webp`. Its source is `https://images.unsplash.com/photo-1519501025264-65ba15a82390`. The photograph illustrates an example prompt; it is not a provider recommendation. Record and check the location when replacing it. The record and film motifs are CSS artwork.

## Interaction

The opening viewport contains the composer and direct starting points. On mobile the composer appears before the story tiles. Starting a request preserves the visual language in the result. Follow-up requests update the same versioned task.

Results feature a leading reference and an adjacent list. Gathering schedules and structured outcomes render separately from cultural discovery. Candidate images are provider-returned; missing images use labelled typographic placeholders. Do not insert unrelated stock photography into results.

Candidate details, evidence and saved spaces use native modal dialogs. Escape closes them, focus stays within an open dialog and closing returns focus to its trigger. Reduced-motion preferences disable animation and transitions.

## Data boundaries

- Render only candidates marked current. Never use stale results or raw catalogue entries as a fallback.
- Derive LIVE and CACHED labels from returned signals. Synthetic candidates remain EXAMPLE even if a signal is mislabelled.
- Query seeds describe search context. They are not causal explanations or proof of personal preference.
- Show unverified cost and availability as unknown. Do not infer practical facts from cultural connections.
- Saving a reference calls the existing collection endpoint. A saved reference is not a booking or an eligibility decision.
- Surface startup failures on the home screen and provide a retry action.

## Validation

`tests/browser/home.e2e.ts` covers responsive entry, refinement, saving, refresh, startup failure, modal focus and evidence integrity. `tests/unit/discovery.test.ts` covers stale filtering, source labels and resolved query seeds. The home browser project uses synthetic fixtures and does not call live providers.
