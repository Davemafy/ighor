# FRONTEND_DESIGN_TOKENS

**Purpose:** source-derived **candidate** token inventory for a single Igor interface. This is *not* a claim that every proposed value has been measured from the PNGs. The owner's 12 references, existing Archivo font and Igor mark remain authoritative. Tokens are labels/working hypotheses until accepted by screenshot overlays.

## Existing source signals — verified from code

| Source | Value currently in repository | Interpretation |
| --- | --- | --- |
| `src/app/mockup-native.css` | `--igor-ink: #141414`; `--igor-paper: #fbfaf8`; `--igor-soft: #f3f1ed`; `--igor-line: #deddd7`; `--igor-subtle: #73716c`; `--igor-signal: #f36b45` | Existing branch implementation; **not** reference-measured truth |
| `src/app/workbench.css` | Archivo from `/marketing/assets/fonts/archivo-latin.woff2`, variable weight 100–900 and width 62–125; `wdth=76, wght=850` for displays | Preserve and tune the actual font axes |
| `src/app/mockup-native.css` | desktop rail = **94px** with icon-above-label | Current implementation, deviates from the wider left sidebar reference |
| `src/app/workbench.css` | rounded top nav and 4-square starter grid | Prior implementation; not faithful to cinematic Home |
| `src/app/globals.css` | legacy global `--paper: #fbfaf6`, serif+Arial choices | Legacy styles must not override Igor active /app surfaces |
| `src/components/igor-spatial-canvas.tsx` | Google Maps loader; WebGL 2D/3D capabilities | Map style/geometry must be applied to the actual map, not a backdrop |

## Proposed semantic design tokens (pending visual verification)

These tokens are **roles**, not an excuse to replace unique composition with generic panels. Avoid another isolated CSS theme. Prefer mapping them onto existing `--igor-*` tokens after reference capture.

### Color

| Token | Working candidate | Usage | Confidence |
| --- | --- | --- | --- |
| `--igor-canvas-light` | `#fbfaf8` | Main white work stage | Existing code |
| `--igor-canvas-contrast` | `#ffffff` | Clean inset cards/search | Approximate |
| `--igor-canvas-dim` | `#f3f1ed` | Muted tabs/panels | Existing code |
| `--igor-canvas-dark` | `#071114` | Home/immersive left rail (verify against reference) | Approximate |
| `--igor-ink` | `#141414` | Primary text/icons | Existing code |
| `--igor-ink-inverse` | `#f9f9f8` | Primary dark-surface content | Approximate |
| `--igor-text-muted` | `#73716c` | Secondary labels/meta | Existing code |
| `--igor-outline` | `#deddd7` | Low-contrast dividers | Existing code |
| `--igor-selection` | `#08090a` | Active tabs/pills on white | Approximate |
| `--igor-accent-informational` | controlled per semantic meaning | Pending, confirmation, warnings, source badges | Do not decorate |
| `--igor-focus-ring` | `#f36b45` | Focus/accessibility when contrast passes | Existing code; contrast to verify |

Use color from approved photography within photography. Do not apply an arbitrary orange glow to every card. No invented 'compatibility-green' for raw Qloo rank.

### Typography

| Role | Proposed contract | Actual check |
| --- | --- | --- |
| Brand | Original Igor logomark + wordmark; don't approximate clover with Unicode | SVG appearance/kerning |
| `display-hero` | Archivo variable; high weight ~850–900, condensed width ~72–80, tracking negative; 2 lines on desktop | Match heading edges, line break and visible counter shapes |
| `display-title` | Archivo, narrower/heavy, size tied to screen hierarchy | Compare 01 vs 04 vs 09 vs 10 |
| `section-title` | Archivo high weight/condensed, less aggressive than hero | 02, 07–11 |
| `card-title` | Archivo medium-heavy, short, crisp | Cards readable without clipping |
| `body` | Archivo normal width, readable 15–17px desktop equivalent | Conversation/description contrast |
| `meta` | Archivo 12–14px, subdued | Provenance/date/source density |
| `mono/numeric` | tabular numerals where alignment matters | Comparison ranks, version numbers, times |

Use CSS `font-variation-settings` where browser supports it. Do **not** mix arbitrary new typefaces to make references look 'editorial'. Mobile must reflow, not be shrunk desktop.

### Spacing scale (candidate in CSS px, requires capture)

`--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`, `--space-6: 24px`, `--space-8: 32px`, `--space-10: 40px`, `--space-12: 48px`, `--space-16: 64px`.

These are candidate intervals to *map observed gaps*, not a mandate to snap away intentional asymmetry. A measured gap in a reference wins over the scale.

### Geometry and composition

| Role | Working proposal | Source/validation |
| --- | --- | --- |
| Desktop navigation width | **measure from 1440 reference**, then lock | Existing 94px branch is *not* reference-faithful; reference shows icon + label |
| Desktop main horizontal inset | approximately 24–48px depending on surface | Inspect at 1440x900 baseline |
| Hero display width | optimize for two-line slogan, avoid overflow | Reference Home |
| Gallery first row | five narrow portrait cards visible in desktop viewport | Discover |
| Gallery second row | five shorter wide cards | Discover |
| Comparison | 4 candidate columns + aligned 6-person rows in flagship sample | Compare; adapt to arbitrary column count |
| Connected plan | timeline primary, tall image/artifact panel secondary | Plan |
| Artifact editor | intentional layered collage left + inspector right where relevant | Create |
| Mobile single panel | 390px viewport; safe-area-aware | 3 mobile frames |
| Minimum touch target | ~44 × 44px | Inclusive interaction target, not screenshot fiction |
| Max text measure | ~65–75 characters for long paragraphs, task dependent | Conversation/readable work |

### Radii, outlines and shadows

| Role | Candidate | Notes |
| --- | --- | --- |
| Small badge/icon | `6–10px` | Evidence label/icon affordance |
| Media card | `10–16px` | Verify exact reference per screen |
| Form/search | `16–26px` | Distinct surface roles; Home large rounded composer |
| Pills | `999px` | Active category chip/filter where reference shows pill |
| Hairline border | `1px solid var(--igor-outline)` | Rare and quiet; use whitespace first |
| Focus | 2–3px visible outline, 2–3px offset | Must pass contrast on dark and light surfaces |
| Shadow | none for most work cards; restrained only for floating editor/map/hero layers | No blanket glow or glass |

### Layering

`z-base=0`; `z-sticky=10`; `z-navigation=20`; `z-map-controls=30`; `z-sheet=40`; `z-dialog=60`; `z-toast=70`. These are architectural slots, not global overrides of existing map-provider stacking contexts. Validate keyboard focus trapping and portal z-index.

### Motion

| Motion role | Behavior |
| --- | --- |
| Hover/tap | 120–220ms subtle change of contrast/transform, where ref supports it |
| Cross-view continuity | Shared object identity, only when corresponding data persists |
| Navigation | 160–320ms, interruptible, never blocks task actions |
| Pending | show real execution state; do not animate fake progress percentages |
| Revision | indicate *confirmed* added/changed/unchanged objects, not speculative flash |
| Reduced motion | `prefers-reduced-motion: reduce`: disable spatial motion and animated maps; preserve state cues |

### Breakpoints

Working layout switches, **not exact screenshot source measurements**: `≤760px` mobile; `761–1023px` compact/tablet; `≥1024px` desktop; large desktop `≥1440px` for reference matching. Tune from content wrapping and real screenshots, not an arbitrary device library.

## State tokens (all actual states)

| Semantic state | Visual treatment | Data authority |
| --- | --- | --- |
| Selected | black/white tab or restrained active background | Local selection or server selected ID |
| Pending | accessible spinner/label, disable duplicate write | Existing turn lifecycle |
| Saved | success only when server confirms | Canonical revision/artifact |
| Error | plain explanation + retry/recover action | Actual response |
| Stale | muted status and accessible warning | Candidate/evidence freshness |
| Unknown | honest 'Not checked' or 'Unknown' | Nullable source field |
| Blocked external action | awaiting approval or unavailable | `plan.work.externalActions` |
| CACHED/LIVE | literal returned source status | Evidence/cultural delivery |
| Focus | visible, contrast-aware outline | Keyboard/accessibility |

## Image delivery contract

- `MediaView` takes a candidate/media ID, verified URL, intrinsic aspect or meaningful fallback, focal point and credit; no mapping named media to unrelated `c01.webp` by position.
- Curated *brand* scenes may be owned/licensed; never imply that a generated editorial photo depicts an actual restaurant or measured group.
- Use responsive `sizes`, lazy load noncritical images, prioritize hero, reserve dimensions to avoid layout shift, keep attribution as required by provider.
- For real results: existing Qloo `imageUrl` accepts authorized `images.qloo.com` images; other media providers require separate validation/licensing policy. Avoid unreviewed domain allowances.
- Maps are interactive tiles and anchored markers, with provider attribution and real coordinates.

## Screenshot acceptance table

| View family | Reference viewport | Visual checks | Functional checks |
| --- | --- | --- | --- |
| Home | 1440 × 900 | hero crop, display baseline, nav, 5 cards, text-safe overlay | arbitrary prompt, keyboard, recovery |
| Discover | 1440 × 900 | category heights, card ratios, spacing, title weights | filters, actual source IDs, detail |
| Conversation, plan, create, compare, library, detail, revise | 1440 × 900 | panel proportions, typography and image alignment | correct state, evidence, edits, restore |
| Maps 2D/3D | 1440 × 900 | map-first composition and control anchoring | real coordinate selection, fallback |
| Mobile | 390 × 844 | safe areas, no horizontal overflow, visual hierarchy | all core paths including revise |

Pixel overlay requires the **original reference PNGs** as test fixtures; current screenshots shown in conversation are not yet checked into this branch. Declare visual acceptance only after artifact capture and comparison. No design-book theme can supersede the owner's reference.
