# Igor mockup → native product: visual implementation review (V1)

**Review branch:** `design/mockup-to-native-ui-20261029`
**Base:** `feat/partiful-codrops-unified-20261029` (draft PR #27)
**Status:** visual implementation pass, **not pixel-verified and not ready to merge**

## Source of truth
- Approved Igor marketing page: its existing black-and-white mark, condensed Archivo display, dramatic image-led object compositions, and quiet surrounding controls.
- The latest 12-screen Igor concept is an **illustrative art-direction target**. Raster-generated UI does not constitute component source, approved evidence, real place reviews, or usable maps.
- Existing architecture, task identities, saved evidence, invitations, documents, and source-linked work remain authoritative.

## What this branch actually implements

| Mockup target | Concrete native path | Result |
| --- | --- | --- |
| Home with headline and four outcome covers | `AgentWorkspace`, existing four local poster assets | Retained real entry actions, bolder display hierarchy and light working canvas |
| Dark narrow identity/navigation rail | `AgentWorkspace` nav, `mockup-native.css` | Real existing navigation and account actions, black rail on desktop |
| Conversation + adaptive work | `AgentWorkspace` | Existing `Work` now adjacent to transcript on desktop; one continuous task and no duplicate data |
| Image-led discovery | `ResearchDiscovery`, source-evidence card model | Responsive visual grid; real source images or honest typographic fallbacks |
| Evidence/details | Existing `DiscoveryDialog`, evidence model | Existing functionality and provenance retained, shell integration |
| Authored outcomes | Existing `InvitationStudio`, `ConnectedWorkCanvas` | Existing editor and persistence retained; no invented reservation or artifact |
| Saved work | Existing `ProductCollections`, thread history | Existing live saved models retained |
| 2D/3D map | Existing spatial `TaskCanvas` and source data | **Not recreated from screenshot**: real map implementation requires verified coordinates, map provider, and browser testing |
| Generic comparisons across domains | Existing `DecisionWork`, candidates | Works with actual stored decisions; screenshot's invented ratings are NOT seeded into the product |
| Tailwind CSS v4 + shadcn Lyra | Not currently in base repository | **Not implemented.** Must be migrated with proper dependencies and lockfile; don't claim Tailwind adoption |

## What is deliberately not copied
- AI-generated restaurant claims, ratings, source quotations, prices, or booking availability.
- Fake map pins, fake 3D structures, or imagery substituted for missing Qloo results.
- The illustrative screen's hard-coded restaurant-specific navigation.
- Unverified click interactions or a second backend state store.

## Acceptance gate (must be completed on current PR SHA)

- [ ] `npm ci`, `npm run typecheck`, `npm run build`, targeted tests.
- [ ] Browser capture: 1440×900 + 390×844 (welcome, one research result, one invitation, one non-gathering goal, saved work).
- [ ] Inspect for horizontal overflow, readable typography, sticky composer, focus indicators, screen reader landmarks and reduced motion.
- [ ] Verify user message → server response → source-linked work → save → reload.
- [ ] Verify a revision that preserves user-selected options and manual text.
- [ ] Side-by-side image review versus the approved marketing design AND the concept screen(s).
- [ ] Tailwind v4 source-component migration if this is to become the permanent app design foundation.
- [ ] Explicit visual approval from product owner; no merge or deploy otherwise.

## Design interpretation
One work object should stay recognizably the same through discovery, detail, comparison, saved work and revision; transitions enhance this but cannot compensate for weak hierarchy. Separate purposeful views use the same brand language. Where content is uncertain, the UI must disclose the uncertainty.

**Known limitation:** This review branch adds scoped CSS because the existing Next app has a substantial CSS design and no Tailwind v4 dependency or lockfile yet. It is an incremental bridge, not a complete shadcn/Tailwind rewrite, nor a proven full mockup conversion.
