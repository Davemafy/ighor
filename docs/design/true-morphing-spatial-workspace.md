# Igor — true morphing task canvases and spatial interactions

## Scope and inheritance

**Base:** `fix/mobile-morphing-quality-gate` (PR #11, still unmerged when this work began). The branch starts from PR #11's exact head `c5544337`. It preserves the responsive shell, safe-area composer, native shared-element helper, existing Next.js/React application, validated presentation tree, versioned mutations, Qloo adapter, connected-work backend, and previous design explorations. It does not redesign the landing page.

The source of authority is the persisted Task. The model supplies a bounded application-owned composition, never HTML, JavaScript, CSS, or event handlers. A result can contain a document, chart, table, timeline, discovery and spatial nodes together. This branch adds one small validated mutation for chart measure selection; it does not add new prompt-to-page routing.

## Interaction architecture

1. **Authoritative state morphs.** `useWorkspace` animates only a successful streamed Task state that creates a visual surface or changes a significant document/chart value. It never animates an anticipated save as if complete. Navigation and focus remain controlled by the existing workspace.
2. **General-purpose canvas.** `TaskCanvas` still renders `PresentationSchema` node trees; interactive filters and charts share the same table data. A chart's chosen numeric column is stored in `canvas.chartAxes` and validated by `chart-axis`. Unsupported, string-valued columns are rejected on the server. Historic tasks parse with `chartAxes: {}`.
3. **Connected creative work.** `ConnectedWorkCanvas` is a projection of existing `Task.work.documents` and `Task.work.decisions`, shown when the backend produces persistent documents without a presentation tree. It reads revisions, supports direct document edits, approval/rejection, protected manual wording and history; all actions use `type: work` with the current optimistic version. Dirty drafts are never silently replaced by new snapshots or failed saves. Stale/conflicted documents are visible but cannot be approved until resolved.
4. **Spatial result.** `IgorSpatialCanvas` remains the Google Maps adapter. Current place cards, persisted selection, stored itinerary, 3D interactive markers, 2D fallback markers and map camera share one Task canvas. Marker clicks and card clicks use the same `select` mutation. 2D markers highlight the selected item through opacity/z-index; 3D custom markers receive selection attributes; the camera focuses on the selected valid coordinate. Selecting an unmappable item explains why the map cannot focus.
5. **Recovery.** The map is activated intentionally (3D or 2D); map/list switching works independently of the provider. A failed SDK load has an explicit retry and place-list fallback; rejected loader promises are cleared for a subsequent explicit retry. The app never invents coordinates or routes. Mapping a current place without valid coordinates is disabled, but its list/detail/itinerary remain editable.

### Reference behavior translated into Igor

- [Monogram's product announcement](https://www.monogram.ai/blog/introducing-monogram): context-sensitive visual answers rather than generic text panels.
- [Daydream's description of refinement](https://daydream.ing/faqs): keep natural conversation connected to interactively refined visual options.
- [Rainbow's documented switch/reorder interactions](https://rainbow.me/support/app/edit-and-switch-wallets): direct reorder and selection with clear active states.
- [Motion layout animation guide](https://motion.dev/docs/react-layout-animations): identifiable shared elements, scroll-aware transitions, and reduced-motion constraints. Igor continues with native View Transitions to avoid dependency weight. Native snapshots are non-interruptible, so large map interactions use provider-native camera movement rather than full-window animations.

These are publicly documented patterns, not instrumented captures of the closed-source iOS apps. The earlier ten Igor exploratory images are catalogued in `docs/design/mobile-motion-quality-gate.md`; their cinematic content, editorial hierarchy and quiet composer remain the design guidance. No image mockups were used as implementation.

## Reproducible validation

### Unit

`npm test -- --run tests/unit/presentation.test.ts` exercises a model-delivered mixed canvas, direct persisted edit/reorder/filter, invalid schema rejection, and the new numeric `chart-axis` mutation. It also asserts that the selected measure is included in the later model context, and that text-valued columns cannot be chosen.

### Browser

Build once, then:

```sh
npm ci
npm run typecheck
npm run build
npx playwright install chromium
npx playwright test --config tests/canvas.playwright.config.mts
npx playwright test --config tests/connected-work.playwright.config.mts
```

The canvas run covers desktop 1440 and mobile 320/390/430, plus a motion-enabled 390 project. It creates the task using the existing API, then installs **explicitly labelled user-supplied test content** in local SQLite to isolate the renderer/mutation system from missing external credentials. The test clicks real controls and sends actual requests to the Next.js task API (not route stubs). It checks a conversation, result morph, expanded artifact, edited/save/reload document, timeline reorder, table filter, persisted chart measure, real 3D marker click, map/detail synchronization, itinerary add/reorder/remove, 2D recovery, missing-coordinate list-only fallback, save failure/retry and browser errors.

The Maps SDK is a browser test double. Google Maps billing, photorealistic imagery, traffic, route computations, marker SDK behavior on actual Google maps, Qloo data quality and actual supplier availability **are not validated** by this test. The synthetic 2D/3D test maps deliberately have no routing.

The connected-work run uses the explicitly scripted development provider, not external LLM/Qloo calls, and tests real document mutations, old revision review, budget follow-up, manual wording preservation and reload. It records mobile screenshots for the connected artifact and motion-enabled browser videos.

Both browser runs write to `test-results/`; GitHub's mobile workflow uploads `igor-mobile-interaction-evidence` if a runner executes. Browser checks include horizontal overflow, composer-viewport visibility, and measured layout-shift/long-task counters saved as JSON. A simulated `--igor-visible-height` tests viewport *geometry* but is **not** a real on-screen phone keyboard.

## Current verification boundary

This branch was authored through the connected GitHub repository interface. The current execution container does not have authenticated access to clone the private repository, so **a local production build, actual Playwright execution, captured browser screenshots/videos, or successful typecheck cannot be claimed until their checks run**. Previous PR #11 and baseline `main` GitHub Actions runs failed before exposing runner steps; inspect the new PR Actions status and artifacts independently.

Release-device verification remains necessary on current Android Chrome and iOS Safari with real keyboards, focus, screen rotation and touch gestures. Provider-key configuration and live service behavior remain outside this patch. Do not merge/deploy on the strength of mocked-provider tests alone.

### Remaining product dependencies

- Natural-language criteria/itinerary-day revisions depend on the existing configured LLM and validated state contract. The browser fixture cannot prove real model interpretation quality.
- Direct `chart-axis` changes work for numeric columns already available in the stored table. The system does not invent new metrics.
- Spatial itinerary stores an ordered set of stops; **day assignment and real routed travel times are not present in the existing spatial mutation contract** and must not be pretended to work. Timeline step reordering is supported separately.
- Connected-work documents without model-authored presentation are shown through an application-owned fallback surface, not as an invented generated composition.
