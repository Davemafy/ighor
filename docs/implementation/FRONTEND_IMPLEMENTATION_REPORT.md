# IGOR — FRONTEND IMPLEMENTATION REPORT (PR #31)

**Date:** 2026-10-30  
**Status:** Implemented for review, **not release-verified**. No merge or deployment.  
**Branch:** `design/reference-contract-foundation-20261030`, parent `design/mockup-to-native-ui-20261029` (PR #28) stacked on engine PR #27.

## Implemented in this PR

| Reference | Working surface and grounding | Notes |
| --- | --- | --- |
| 01 Home | Cinematic approved local hero photo, 5 starter image cards, editable prompt chips, general-purpose composer | Uses existing Igor photography and Archivo; exact reference crop remains unverified |
| 02 Discover | Search, type filters, distinct media cards, real sample exclusion, honest missing images, detail and compare actions | Data from canonical task projection |
| 03 Conversation | Existing authenticated durable conversation, SSE recovery, activity and source links retained | Prior code reused; not redesigned as standalone chat |
| 04 Plan | Context/constraints, actual schedule and selected/itinerary objects, detail drilldowns | No invented times or availability; document-only tasks get appropriate work |
| 05 Maps 2D | Existing Google Maps-backed spatial renderer, only grounded geocoded IDs, place list | Requires provider config for live visual check |
| 06 Maps 3D | Reuses current Google 3D adapter and existing graceful fallback | Immersive 3D visual not validated with live key |
| 07 Create | Existing editable connected-work canvas, artifact editor and InvitationStudio | Separate contextual Create navigation; no fake send/publish claim |
| 08 Compare | Actual candidate matrix, per-query Qloo signals (rank and raw affinity), evidence sources, missing values and constraints | Comparison selection is transient unless already saved via existing canvas |
| 09 Library | Existing server-backed saved collections and task history, labeled library navigation | Existing backend contract retained |
| 10 Details | Candidate media/metadata, actual evidence records and limitations, Qloo explanation scope, source links | No invented ratings, per-person scores or review tabs |
| 11 Revise | Canonical revision receipts, artifact history, current version display; no unsupported Restore action | Server-driven follow-up still uses existing composer and engine |
| 12 Mobile | Five-option bottom nav, safe-area composer, stacked layout and comparison horizontal scrolling | Screenshot suite written, execution pending |

**Code additions/refinements:**
- `src/components/reference-work.tsx`: canonical-data views rather than 12 disconnected demos.
- `src/components/workspace-view-model.ts`: schema validation and stable data selectors.
- `src/components/workspace-api.ts`: additive snapshot GET, preserving turn transport.
- `src/components/agent-workspace.tsx`: navigation and view integration; existing engine hooks, SSE, edits and persistence retained.
- `src/app/mockup-native.css`: consolidated Igor styling and responsive reference geometry (no new UI framework).
- `src/app/app/page.tsx`: deep-link the new views.
- `tests/unit/workspace-view-model.test.ts`: canonical state, unknowns, map and Qloo scope checks.
- `tests/browser/reference-integrated.e2e.ts` + configuration: desktop/mobile screenshots and navigation smoke checks.
- `FRONTEND_VISUAL_AUDIT.md`, `FRONTEND_COMPONENT_MAP.md`, `FRONTEND_DESIGN_TOKENS.md`: source and implementation contracts.

## What still requires verification or work

1. **CI runner**: Github Actions Verify and Igor Mobile Interaction jobs repeatedly fail before exposing job steps or test output. Runner is `ubuntu-latest` in `.github/workflows/verify.yml`. This is not evidence of a passing or failing TypeScript build. Inspect GitHub Actions billing/runner/account settings and rerun exact head SHA in a working runner. Do not claim the app is tested.
2. **Exact TypeScript/build and browser acceptance**: Node dependencies and a working runner are unavailable in the current connected execution environment. `npm ci`, typecheck, lint, test, build and Chromium capture not executed successfully. Reference alignment remains **unverified**.
3. **Real provider acceptance**: Qloo, research, 2D/3D map provider, image licensing and external writes must be validated with authorized keys and real data. Fixture mode is explicitly labeled, and a source photo is never represented as a verified real venue.
4. **Comparison persistence**: The UI consumes `canvas.comparisonIds`, but transient selections made within the reference matrix are intentionally not claimed saved; a future canvas mutation route should persist these directly.
5. **Restore**: Historic artifact content is inspectable; there is no unsupported Restore button. A server-supported atomic artifact restoration mutation is required before adding it.
6. **Pixel fidelity**: High-resolution owner screenshots are not yet in the repo as fixtures; dimensions and composition estimates from the reference have not been measured against actual Chromium screenshots. UI is a faithful direction but not signed off at reference bar.
7. **3D**: The real renderer is already implemented but not guaranteed without Maps configuration, device capability and approved billing.
8. **General-purpose acceptance**: A non-cultural task and the six-person film/music revision journey still need real browser + provider end-to-end verification.

## Verification commands once runner is fixed

```bash
npm ci
npm run format:check
npm run typecheck
npm run lint
npm test
npm run test:eval
npm run build
npx playwright install chromium
npx playwright test --config tests/reference-integrated.playwright.config.mts
npm run test:browser
```

Take and compare approved 1440×900 and 390×844 reference captures; verify keyboard, reduced motion, no horizontal overflow, source accuracy, concurrent revision conflicts, no duplicate requests after failed SSE, and real saved-work restore/reopen.

**Merge condition:** exact-commit CI, browser screenshot review, engine owner integration acceptance, and user visual sign-off. No production deployment as part of this PR.
