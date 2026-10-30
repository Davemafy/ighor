# FRONTEND_VISUAL_AUDIT

**Status:** visual decomposition and implementation acceptance contract, **not** an assertion of pixel-measured fidelity.  
**Reference authority:** the owner's 12 supplied Igor images (screens 01–11 plus three mobile compositions in screen 12). The original contact sheet is secondary.  
**Repository baseline inspected:** `design/mockup-to-native-ui-20261029` at `6fb820a483bff3b83c680459334dda929de01c49`, based on engine PR #27 at `53ed2bdd5b42a02e015de80d0fe9ecae0e1bf93c`.  
**Competing frontend experiment:** PR #30 (`feat/reference-faithful-home-explore`) is more recent but based on `main`; its invented image mapping and standalone entry shell are **not** acceptance evidence.

## How to read these measurements

Observed relationships are based on supplied screenshots, **not** DOM measurements, Figma metadata, or original image assets. Exact values must be recovered from originals at native pixel resolution and checked against Playwright captures. Reference images may contain illustrative factual errors; composition is the visual reference, never proof of live recommendations, affinity, availability, geography or cast identities.

**Reference grammar:** a dark, full-bleed *Home*; predominantly warm-white productive surfaces; a compact consistently recognizable Igor mark/navigation; bold, narrow Archivo display headings; photographic content with intentional crops; restrained controls; strong factual/evidence hierarchy; genuine map views when geolocation exists.

## Screen-by-screen decomposition

### 01 — HOME
1. **Layout:** dark left navigation; remaining canvas is a full-height photographic stage, not a white marketing page.
2. **Hierarchy:** 2-line enormous slogan → 2-line supporting copy → single high-contrast composer → small prompt chips → five distinct tall image-led ideas.
3. **Type:** condensed heavyweight white headline; proportionally smaller sans supporting copy and short chips; labels laid on photographs with high local contrast.
4. **Geometry:** narrow fixed rail and padded content stage; feature cards form one horizontal row with deliberate crop/overlay, not four square products.
5. **Imagery:** one cinematic interior/skyline master, five different vertical stories; dark gradient only for readability; mobile crop maintains headline clearance.
6. **Controls:** free-form multiline composer, submit, quick starts, cards, account/nav. Only actual actions; no fake intent-routing modal.
7. **States:** keyboard focus, disabled submit, initiating/pending, interrupted/recovered conversation; selected Home navigation.
8. **Responsive:** mobile near-full-screen hero, short prompt grid and five-item bottom navigation; cards may move below the fold rather than become unreadable.
9. **Data:** first-party curated editorial starting points may be labeled as such; no assumed taste profile until supplied.
10. **Reuse:** `IgorShell`, `AgentComposer`, `MediaCard`, `StarterAction`, `AgentStatus`; unique cinematic hero composition.

### 02 — DISCOVER
1. **Layout:** bright working surface; top search; horizontal domain filters; two vertically stacked image-led content sections.
2. **Hierarchy:** search → categories → Trending for you → portrait cards → Because your crew likes → shorter landscape cards; section labels must reflect real data basis.
3. **Type:** bold condensed section headers; dense clear card titles and compact category metadata.
4. **Geometry:** fixed sidebar, main column padding, five visual cells in a scrollable rail; first-row images taller than second.
5. **Imagery:** actual content image when authorized; consistent focal positioning, fallback block if absent; do not use an unrelated brand photo as a named film/artist.
6. **Controls:** query, category, carousel scroll, contextual card/detail, favorite/save. Item actions preserve canonical candidate IDs.
7. **States:** active filter black/white, active row focus, saved, loading, no results, missing media/provenance.
8. **Responsive:** search and filters occupy narrow top strips; horizontally scrollable cards; no page overflow.
9. **Data:** general/trending and personalized recommendation streams are **different** data contracts; context and evidence required for personal claim.
10. **Reuse:** `DiscoveryRail`, `CategoryTabs`, `CandidateCard`, `EvidenceTag`, `MediaFallback`.

### 03 — CONVERSATION
1. **Layout:** quiet white transcript; contextual candidate result region rather than generic chat + unrelated dashboard.
2. **Hierarchy:** user prompt → agent response/progress → actual participant identities when supplied → matching result candidates and explanations → persistent composer.
3. **Type:** conversational body remains readable; compact user labels/signal copy; only section names use narrow weight.
4. **Geometry:** bounded content column with comfortable line lengths and a bottom composer; cards align in a responsive 3-column group when the data warrants.
5. **Imagery:** candidate pictures sourced from candidate/media metadata; participant avatars only when explicitly stored, never fictional injection.
6. **Controls:** message, select/open card, inspect evidence, edit prompt, recover, resolve entity.
7. **States:** streamed, blocked, partial, retry/recover, ambiguous entity, complete, stale evidence, user edit in-flight.
8. **Responsive:** transcript and associated work become sequential focusable panes; composer stays accessible when keyboard opens.
9. **Data:** `conversation`, `participants`, `discovery`, `execution` from authoritative workspace snapshot; SSE journal for recovery.
10. **Reuse:** `ConversationThread`, `AgentActivity`, `ParticipantStrip`, `EvidenceCard`, `AgentComposer`.

### 04 — CONNECTED PLAN
1. **Layout:** editorial title/meta top; tabs; left event timeline and right tall photographic/artifact cover in reference.
2. **Hierarchy:** name → contextual facts → Overview/Itinerary/Map/Options/Notes → stops/times → cover/action.
3. **Type:** large condensed plan title; strong compact activity labels; muted factual metadata.
4. **Geometry:** substantial main-stage margins; timeline guide line with aligned dots; image takes about a third of content width (estimate).
5. **Imagery:** first-party cover or grounded media, never a fabricated venue snapshot; can be absent without collapsing structure.
6. **Controls:** tabs, add stop, open stop, reorder, share where implemented, edit constraints.
7. **States:** selected tab black pill, pending edits, version conflict, unknown time/price/access, preserved selections.
8. **Responsive:** one-column itinerary and optional cover; horizontal tabs scroll; stable item identity.
9. **Data:** `plan`, `discovery`, `participants`, `artifacts`; for non-itinerary tasks render a non-spatial work surface.
10. **Reuse:** `OutcomeHeader`, `WorkTabs`, `PlanTimeline`, `ArtifactCover`, `ConstraintStatus`.

### 05 — MAPS 2D
1. **Layout:** dark styled real map; floating search/filter chips, left place-list inspector, right map controls.
2. **Hierarchy:** map canvas primary; place list second; selected marker/detail third; attribution visible.
3. **Type:** high-contrast short place labels and compact venue metadata.
4. **Geometry:** list overlays one side; no fake map grid behind; pins and list are synchronized.
5. **Imagery:** place thumbnails where grounded; provider map tiles remain interactive and attributed.
6. **Controls:** search, filters, list selection, markers, zoom, recenter, detail, add to plan.
7. **States:** selected marker, filtered/unmapped place, loading/error, no geocodes, provider-unavailable fallback.
8. **Responsive:** map with bottom sheet or accessible place list; safe-area-aware controls.
9. **Data:** `spatial.geocodedPlaceIds` only for pins; never infer coordinates from names.
10. **Reuse:** `PlaceList`, `MapMarker`, `PlacePreview`, `MapFallback`; reuse Google Maps adapter currently in repo.

### 06 — MAPS 3D
1. **Layout:** immersive 3D scene, prominent place callouts and selected bottom inspector; navigation remains visible.
2. **Hierarchy:** place-relevant camera/map → labels → selected place sheet and actions.
3. **Type:** white high-contrast labels against dark view; concise supporting metadata.
4. **Geometry:** full viewport scene; overlays anchored to mapped points, not fixed decorative positions.
5. **Imagery:** live supported 3D map, not a prerendered city screenshot.
6. **Controls:** 2D/3D switch, tilt/zoom, movement, select, details, add to plan.
7. **States:** camera loading, unsupported provider/capability, selected pin, reduced-motion mode.
8. **Responsive:** conserve GPU and battery; prefer 2D fallback by default when necessary.
9. **Data:** same geocoded IDs as 2D; map availability is not restaurant availability.
10. **Reuse:** `SpatialView` + shared `PlacePreview`, `MapFallback`; 3D adapter already exists.

### 07 — CREATE
1. **Layout:** large editable visual composition left; narrow structured itinerary/metadata inspector right.
2. **Hierarchy:** Draft → big artifact title → important fields/actions → staggered image collage → explanatory copy and sections.
3. **Type:** huge condensed title; readable edit fields; strong small section labels.
4. **Geometry:** deliberately overlapping photo cards with rotation/offset and bounded shadows; NOT a symmetric dashboard grid.
5. **Imagery:** all cover slices must have authorized source; fallback illustration/typographic treatment for non-image tasks.
6. **Controls:** content edit, date, sections, save, create invite, share after confirmation, regenerate constrained revision.
7. **States:** draft, dirty, saving, saved, blocked, history, conflict, external-action approval.
8. **Responsive:** focused editing and side inspector as separate drilldown; never stack uneditable fake text.
9. **Data:** `artifacts.current/history`, `plan.work`; support documents/reports/proposals, not only invitations.
10. **Reuse:** `ArtifactEditor`, `InvitationStudio`, `ArtifactVersion`, `MediaCollage`.

### 08 — COMPARE
1. **Layout:** horizontal comparison matrix with four named candidate columns in reference, rows aligned across six participants.
2. **Hierarchy:** title/description → domain tabs → candidate image → participant-specific evidence → add-to-plan row.
3. **Type:** small labels and compact rich rows; raw ranks/affinity not overblown marketing percentages.
4. **Geometry:** fixed shared columns, image headers aligned, repeated row heights; horizontal scrolling on narrow screens.
5. **Imagery:** same canonical candidate ID resolves to same media across views.
6. **Controls:** category tab, add/remove item, open source, add to plan, clear with confirmation where needed.
7. **States:** selected tab, saved, stale, missing comparisons, incompatible metrics, unknown values.
8. **Responsive:** horizontal table scroll or focused column-by-column compare; keep participant and candidate headers in context.
9. **Data:** candidate cultural signals per **query**, with rank valid only within that query; no invented group score or cross-query sorting.
10. **Reuse:** `ComparisonMatrix`, `CandidateHeader`, `PersonSignalRow`, `EvidenceInspector`.

### 09 — LIBRARY
1. **Layout:** white background, large condensed heading and subtitle, category pills, three-across content image grid.
2. **Hierarchy:** saved work title → filters → actual persisted items with preview and type/count.
3. **Type:** strong image-card names; small quiet metadata.
4. **Geometry:** aligned gallery gaps and consistent wide-ish covers; responsive columns, not arbitrary masonry.
5. **Imagery:** asset from stored artifacts or grounded candidate; placeholders are distinct by type, never falsely attributed.
6. **Controls:** search, type filters, open, saved/unsave where supported, organize when server-backed.
7. **States:** loading, empty, no matches, stale output, reopened focused context.
8. **Responsive:** two/one column adaptive cards; persistent bottom nav.
9. **Data:** authenticated task history/outputs; no local fake collection substituted for real saved work.
10. **Reuse:** `LibraryGrid`, `SavedWorkCard`, `SearchFilter`, `WorkPreview`.

### 10 — DETAILS + SOURCES
1. **Layout:** panoramic media hero and contextual actions; horizontally arranged tabs; bounded evidence card and source entries.
2. **Hierarchy:** identity/metadata → action → selected section → rank/affinity scope → actual source records.
3. **Type:** large title over hero; dense source provenance text differentiated from interpretation.
4. **Geometry:** wide top banner, pill-style tabs, evidence in a bright inset with columns; collapse gracefully without image.
5. **Imagery:** only genuinely linked image; hero crop must preserve important subject at different aspect ratios.
6. **Controls:** add to plan, compare, save, source opening, why-this, play only if legitimate media player exists.
7. **States:** Sources selected, missing affinity, cached/stale, missing citation, no source link.
8. **Responsive:** content-first detail with compact tab overflow and readable evidence labels.
9. **Data:** `CandidateInput.cultural`, `EvidenceSchema`; distinguish per-result vs aggregate contributors and Igor interpretation.
10. **Reuse:** `EntityDetail`, `EvidenceInspector`, `SourceProvenance`, `MediaHero`.

### 11 — REVISE
1. **Layout:** user change bubble, agent response, semantic changes list, image preview strip, version timeline, composer.
2. **Hierarchy:** requested change → actual change/preserve summary → updated outcome → versions and restore.
3. **Type:** readable response; bold condensed section headings; muted timestamps/current state.
4. **Geometry:** timeline and icons well aligned; low-noise groups and generous whitespace around change diff.
5. **Imagery:** preview only if updated actual artifact/media exists.
6. **Controls:** follow-up, inspect old/current version, restore only if backend supports versioned mutation.
7. **States:** revision pending, current, superseded, stale dependencies, conflict, restore unavailable.
8. **Responsive:** change sections stack; versions remain navigable by touch.
9. **Data:** snapshot revision, artifact history, canvas previous, actual diff of canonical IDs; no premature 'Done'.
10. **Reuse:** `RevisionSummary`, `WorkVersionTimeline`, `PreservedObjects`, `AgentComposer`.

### 12 — MOBILE
1. **Layout:** three distinct references (cinematic home, map/discovery, plan timeline) in phone frames; these are responsive variants, NOT three new task stores.
2. **Hierarchy:** one primary surface at a time; clear back/context, bottom 5-icon navigation, visible primary action.
3. **Type:** display at readable mobile scale and consistent rhythm; avoid desktop type simply shrunk.
4. **Geometry:** approximately 390px design viewport; respect safe areas; touch targets around 44px where possible.
5. **Imagery:** same asset IDs, different mobile crops, stable focal points.
6. **Controls:** bottom Home/Explore/Create/Library/Search, map gestures, composer/submit, plan items, edit/revise.
7. **States:** active bottom item, sheet expansion, virtual keyboard, scroll lock, loading and accessibility focus.
8. **Responsive:** contextual drilldown, comparisons swipe/scroll, map/inspector swap, creation editor stays real.
9. **Data:** exact same server-owned snapshot/revision as desktop.
10. **Reuse:** `MobileNavigation`, `MobileSheet`, `ResponsiveWorkStage`; no duplicated business logic.

## Preliminary visual asset inventory

| Asset family | Source hierarchy | Acceptance gate |
| --- | --- | --- |
| Igor mark/wordmark | Existing `public/marketing/assets/brand/*` | Actual logo asset and dimensions; black/white inverted variants |
| Brand hero | Approved reference-matched licensed/owned photograph | Correct scene, crop, text-safe region, rights; no fabricated venue assertion |
| Editorial discovery images | Candidate's eligible `imageUrl` or authorized image/provider resolver | Candidate identity must match picture; correct license/attribution |
| Film/music cover art | Authorized media artwork, preferably source-linked | Do not silently substitute fabricated art for named works |
| Crew avatars | Stored participant images only; initials otherwise | No invented people/tastes in real thread |
| Venue imagery | Real credited place media when available | No stock image presented as a photo of an actual venue |
| Map | Existing Google Maps 2D/3D provider | Only geocoded pins; attribution; graceful fallback |
| Collage/plan covers | Reused stored authorized assets | One canonical media ID across work/compare/detail |
| Icons | Existing Lucide and Igor mark | Consistent stroke, alignment and state |

## Gaps observed in the current frontend

- `src/components/agent-workspace.tsx` still owns both navigation and the entire working view; its current 3-item navigation differs materially from reference Home/Explore/Create/Library/Maps/Search.
- `src/app/mockup-native.css` makes a fixed **94px icon rail**, whereas the supplied desktop reference shows a wider icon-plus-label rail. This is a deliberate current discrepancy, not approved fidelity.
- `src/app/workbench.css`, `native-workspace.css`, `mockup-native.css` contain overlapping visual rules; unify through source-derived tokens instead of adding yet another global skin.
- Current saved and research components are valuable logic but visually not aligned to all 12 references.
- Source images and screenshots are not yet imported as versioned reference assets in the UI branch, so image-by-image pixel differences have **not** been tested.

## Visual acceptance sequence

1. Obtain/version reference PNGs and approved asset manifest; record native dimensions and legal provenance.
2. Capture real browser at **1440×900** and **390×844**, matching rendering DPR and fonts.
3. Measure side-rail/content boundary, header baselines, card bounds/aspects, image focal points and typography in screenshot overlays.
4. Fix largest geometric discrepancies before microinteraction tweaks; no arbitrary design embellishments.
5. Test keyboard/motion/empty/error/data-not-present states alongside the happy path.
6. Mark a view accepted only after both visual comparison **and** canonical behavior tests; do not turn screenshots into nonfunctional UI layers.
