# Igor UI design system — implementation contract

**Scope:** Igor home/discovery, /app workspace, editable invitations, cultural references and future outputs. This is an implementation contract, not an invented Partiful token sheet.

## Authority and precedence

1. This document summarizes verified **Igor source rules**; source-of-truth implementation docs remain [Discovery system](design/igor-visual-system.md), [Partiful-oriented invitation contract](design/partiful-native-invitation.md), [Partiful interface review](design/partiful-interface-review-20261028.md) and [native workspace CSS](../src/app/native-workspace.css).
2. The **interaction and expressive-output hierarchy** is derived from publicly observable Partiful flows: content first, quiet surrounding controls, immediate preview, editable draft and a real next action. Do not copy their proprietary artwork, trademarks or code.
3. The cloned [MIT Codrops grid](https://github.com/Ibaliqbal/grid-layout-transition) contributes *only* a proven responsive image-grid layout and layout transition method. The original MIT license is retained at `src/vendor/codrops-grid/LICENSE`. Do not use its unrelated imagery, global resets, typography or full demo shell.
4. For each actual surface, preserve **existing Igor typography, navigation, task APIs and focus model**. Never add a separate dark instrument shell for one capability.

## Existing visual foundations — no new palette

| Surface | Existing source values | Rule |
| --- | --- | --- |
| Discovery/home | `#fafaf6` canvas, `#222421` text, `#3e4ff0` primary action; **Bricolage Grotesque** headings, **DM Sans** body/controls | Keep the documented discovery system, local font licenses, and current responsive composer |
| /app shell | Neutral paper `#f7f7f7` and `#efeee8`, black/near-black type; **Archivo** in `native-workspace.css` | Existing navigation and chat composer stay in place; authored content occupies the work area |
| Invite poster | Existing `invitation-studio.css` colorways, editorial layout and Archivo | Color and personality belong **inside the invitation artifact**, not in the app chrome |
| Cultural imagery | Returned candidate media when current, or labelled typographic fallback | No stock substitute represented as Qloo result; no invented venue/image data |
| Interactive gallery | Existing `LiquidDiscovery` and Motion layout owner; responsive CSS from MIT Codrops adapter | A layout choice, not a new design language or second app shell |

The home and /app font choices are **existing route-specific decisions**, not a license to pick new fonts ad hoc. Color values here are copied from current Igor source, not asserted to be Partiful's proprietary tokens.

## Non-negotiable product rules

- **One expressive object per scene.** An authored invite: poster; discovery: source images; document: actual document; map: valid provider coordinates. Tools, trace and actions remain peripheral.
- **No zombie UI.** No faux HUDs, radar/crosshairs, luminous network nodes, scientific-looking rank decorations, invented names such as *instrument/reel/lens*, or universal dark dashboard. Avoid a new body/global CSS reset.
- **No fake outcomes.** Never show a booking, venue photo, price, personal affinity percentage or causal preference explanation that is not established by the saved task evidence.
- **Real editing.** Preview follows user edits; server save acknowledges only confirmed completion. Preserve manual edits, task versions and approvals.
- **Real source separation.** Qloo LIVE/CACHED/EXAMPLE derives from saved evidence; association is not availability or a person's endorsement. Keep details accessible but not louder than the result.
- **Responsive and accessible.** Mobile starts with the composer; content does not horizontally overflow; real buttons with 44px touch targets; Escape and focus return on modals; reduced-motion does not hide content or controls.
- **No unnecessary engines.** Use Igor's existing Motion layout system for card geometry. Do not mount GSAP Flip on the same elements; no WebGL/Atelier providers without a separately verified need.
- **No empty spectacle.** If a surface cannot use actual current references, it renders an honest fallback rather than decorative fabricated data.

## Concrete application

**Gathering conversation:** the native Invitation tab from `src/components/invitation-studio.tsx` is offered when a real gathering brief exists. Its local-only colorway is an artifact choice, not a global theme. Title/body edits use the existing versioned artifact mutation.

**Source-backed discovery:** `src/components/liquid-discovery.tsx` uses current task candidate IDs, real returned artwork where present and the same inspect/choose/compare actions. The Codrops-derived density switch changes layout without changing identities or claiming to refresh Qloo. The selected item reveals its current source details in an accessible native dialog.

**Other goals:** retain native documents, task canvas and map/list views. Do not apply invitation styling globally.

## Metacognitive design gate

Before accepting each change, ask and record:

1. **Source:** Which *existing* Igor design rule or licensed upstream behavior supports this exact choice? If none, reject it.
2. **Function:** What user decision or edit does this affordance help? If cosmetic only, remove it.
3. **Continuity:** Does it keep the same task, source record, keyboard state, and handoff across views?
4. **Truth:** Could a judge mistake an illustrative asset for live Qloo evidence or a booking? If yes, relabel or omit.
5. **Proof:** Can a unit or Chromium test demonstrate this interaction at 390px/1440px, including reduced motion?

No marketing video or README should feature a visual until its actual UI state passes this gate. Placeholders are acceptable when evidence is missing.

## Release evidence

- [ ] TypeScript, format, lint, build and appropriate unit suites pass at the exact PR SHA.
- [ ] Recorded Qloo invitation: title edit → preview → saved artifact → reload at desktop and mobile.
- [ ] Current-source gallery: image-led view → detailed view → inspect evidence → choose/compare → reload.
- [ ] 390px and 1440px screenshot review: content first; no unrelated visual shell or overflow.
- [ ] Images are correctly sourced/licensed before public marketing reuse.
- [ ] Only after review: gather real interaction footage for the GitHub hero.

This contract deliberately does **not** prescribe Partiful's unpublished tokens or license.
