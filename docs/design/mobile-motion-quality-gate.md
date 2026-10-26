# Igor — mobile interaction and motion quality gate

This is a targeted refinement on top of the existing declarative canvas and connected-work architecture. It does not replace the renderer, backend or Igor identity.

## Ten earlier Igor design explorations — reusable patterns

The ten supplied images are existing Igor explorations, not downloadable UI assets and not proof of interactive behavior. In attachment order:

1. Light, quiet work hub: conversation entry, visible drafts, editorial recent work and compact interest chips. Retain its calm density, not its competing tabs.
2. Dark cinematic discovery: a large visual starting card, light conversational result, immersive full-screen experience detail. Retain the card-to-detail rhythm.
3. Bright adaptive discovery: bold creative illustration, spatial stacked cards and collections. Retain spatial depth for contextual content, not decorative floating UI everywhere.
4. Light planning progression: task input evolves into an editorial itinerary with accessible row actions.
5. Dark image-led experience: expressive portrait, restrained conversation and full-bleed destination result.
6. Dark exploration: immersive large hero, thumbnails, layered outcome. Retain context-dependent hierarchy, not location-specific assumptions.
7. Purple-toned agent direction: an expressive entry surface and a detailed connected plan. Treat the orb/mascot as optional campaign identity, never mandatory product chrome.
8. Bronze cinematic direction: tactile tiles, warm light and an explicit “Why these picks?” evidence explanation.
9. Dark-and-light conversation: visible result stack, selected detail and saved action. Reinforces continuity between views.
10. White and playful direction: cheerful framing, direct actionable suggested requests and approachable conversations.

**Unified language:** existing DM Sans, charcoal/ivory core surfaces, selective warm/lilac highlights already in the system, generous editorial type for results, consistent 16–20px surface radius, Lucide icons, authentic provider photos where available, text fallback otherwise. Never substitute image mockups for stateful components. Default mode is a general-purpose task composer; cultural discovery is only one result type.

## Product behavior research — transfer, not cloning

- [Monogram](https://www.monogram.ai/) and its [iOS product description](https://apps.apple.com/us/app/monogram-ai-visual-ai-answers/id6772350876): a natural question turns into an immediately explorable visual interface rather than a wall of messages. Our canvas contract already supports bounded text, chart, table, document, timeline, discovery and spatial nodes, so UI work should amplify that instead of replacing it.
- [Daydream](https://daydream.ing/about) and [FAQ](https://daydream.ing/faqs): natural-language refinements and a continuous conversational shopping/discovery flow; refinements affect actual result state. Igor retains a persistent composer and versions the underlying task/canvas.
- [Rainbow's documented switch/edit interactions](https://rainbow.me/support/app/edit-and-switch-wallets): compact contextual controls, direct selection and rearrangement. Apply this behavior to canvas tabs, timeline ordering and saved work, not Ethereum-specific product structure.
- [Motion's shared layout guidance](https://motion.dev/docs/react-layout-animations): layoutId, LayoutGroup, AnimatePresence, correct measurement in scroll containers and reduced-motion considerations. Motion is not installed in Igor. This patch uses native browser View Transitions with a reduced-motion/no-support fallback rather than adding a new animation runtime. Native transitions have limitations versus interruptible Motion transitions; do not overstate equivalence.

Public documentation and demos informed these patterns; no claim is made that the native mobile applications were instrumented hands-on.

## Implemented task shell

- On compact screens, conversations and canvases use one vertical task shell; global bottom navigation disappears during focused work. A back control returns to history.
- The two-line conversation heading can wrap instead of clipping into the header controls.
- A visualViewport-driven CSS height follows keyboard-driven viewport resizing; composer, thread and canvas occupy separate flex rows. Conversation content scrolls within the remaining space, with safe-area padding.
- A generated canvas opens in “Your result” mode when its saved surface changes. “Conversation” can be re-opened without discarding the result or task state.
- Canvas filters, chart selection, timelines, document saves and map markers still use the existing optimistic-versioned task API; they are not staged visual demos.
- Candidate art-to-detail and canvas expansion use a short shared transition when supported and instantly update when prefers-reduced-motion is active.
- Existing SSE progress, explicit failure/retry states, source details and no-fabricated-map-data policy stay in place.

## Browser verification and evidence

`tests/browser/canvas.e2e.ts` now uses real task routes and saved SQLite state plus a stub **only** for the external Google Maps SDK. On the mobile project it checks:

1. Initial conversation and visible composer — `01-conversation.png`
2. Conversation-to-canvas morph, with real selection — `02-result-morph.png`
3. Expanded artifact and successful return — `03-expanded-artifact.png`
4. Editable document save/revision with persisted task mutation — `04-saved-revision.png`
5. Geospatial view, interactive 3D map test double, selected place and stored itinerary — `05-geographic-result.png`

The new `mobile-motion` Playwright project runs with motion enabled and saves video; `mobile` exercises reduced-motion behavior. Browser image/video files are captured to CI's `test-results/canvas/` artifact when the test runs successfully; they're not committed as fake proofs.

**Remaining physical device gate:** iOS Safari and Android Chrome with their actual software keyboards, scroll and orientation transitions, map API credentials and non-synthetic provider data. Screenshot tests cannot independently prove these conditions. A screenshot taken before the current build should not be used as an assertion about the current code.

**Deployment note:** base `7835653` has a failed Railway status, and integrated main `29b7bee` has a successful Railway status in GitHub; the uploaded screenshot itself contains no deployment SHA. The review branch is not deployed.
