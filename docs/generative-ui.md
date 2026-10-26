# Igor task canvas

Igor now accepts an optional declarative `presentation` in the existing model decision. The agent chooses a composition of trusted components for each task. It can combine a comparison table with findings and sources, or an editable document with a timeline, rather than choosing a predefined destination page.

## Production source and architecture

- Source: private `Davemafy/igor`, inspected at `783565321b60cb7e80f85285e52a9cc132466569`. GitHub reported a successful Railway deployment for that revision.
- Next.js 16, React 19, Zod 4, Lucide. No dependency changes or framework migration.
- Existing model adapters: OpenAI Responses and Gemini, both using the bounded `update_brief` decision contract.
- Existing orchestration: `runTurn`, task versions, SSE `action`/`state`/`done` events, session ownership checks, SQLite task persistence.
- Existing Qloo discovery, practical fact checks, artifacts, collections and review links remain in place.
- This change targets `/app`. Homepage routing is unchanged.

## Reference contracts used

- [CopilotKit examples](https://github.com/CopilotKit/generative-ui): declarative component description, state data and rendering are distinct concerns.
- [assistant-ui generative UI](https://www.assistant-ui.com/docs/tools/generative-ui): a model composes a runtime tree from an application-owned vocabulary. Component props have schemas.
- [CopilotKit shared state](https://docs.copilotkit.ai/a2a/shared-state): agent outputs and direct UI interactions operate on the same task state.
- [Vercel demo](https://genui-demo.vercel.app/): interactive output and conversation remain coherent. Its older RSC architecture was not adopted.
- [CopilotKit overview](https://docs.copilotkit.ai/concepts/generative-ui-overview): combine declarative composition, controlled tool-result rendering and streamed activity where appropriate.
- [Google Maps 3D contract](https://developers.google.com/maps/documentation/javascript/reference/3d-map) and [markers](https://developers.google.com/maps/documentation/javascript/3d/marker-overview): lazy `maps3d` import, `Map3DElement`, interactive markers, camera transitions and provider events.

These are implementation patterns, not dependencies or a claim of A2UI protocol compatibility.

## Vocabulary and rendering

`src/core/presentation.ts` defines the shared model/server/browser schema. Container nodes (`stack`, `columns`, `tabs`) refer to child IDs. Leaves are `text`, `findings`, `sources`, `table`, `chart`, `document`, `timeline`, `discovery`, `spatial`, and `activity`.

Validation rejects unknown component types and props, cycles, orphans, duplicate IDs, excessive depth, oversize compositions, malformed table rows, nonnumeric chart columns and references to unavailable evidence, candidates or artifacts. The limit is 32 components, six levels and 60 KB per composition. The model cannot supply JavaScript, HTML, CSS, URLs, event handlers or tool authority. React renders text as text.

Charts derive from a referenced table, so filtering updates both. Source links come only from stored evidence and permit HTTP or HTTPS. Drafts have an explicit basis: general knowledge, supplied data, retrieved evidence or authored draft. Research without retrieved evidence is clearly labelled; a presentation does not turn general knowledge into sourced research.

`TaskCanvas` uses Igor's existing typeface and Lucide icons, dark work surface, paper document preview, responsive containers, expansion and preserved work history. The universal composer remains available. Existing artifact content binds directly rather than being duplicated into another document store.

## Bidirectional task state

The canvas lives on `Task.canvas` in the existing SQLite task row. Optional schema fields preserve compatibility with old saved conversations. No new state store is introduced.

The `canvas` turn carries `surfaceId`, the existing optimistic task version and one typed mutation:

| Mutation    | Shared result                                                        |
| ----------- | -------------------------------------------------------------------- |
| `edit`      | Saves an authored document's content                                 |
| `filter`    | Stores the table filter used by both table and chart                 |
| `select`    | Selects an offered, current candidate across discovery and map views |
| `itinerary` | Adds, removes or reorders current candidate IDs in the place plan    |
| `reorder`   | Reorders the exact existing timeline steps                           |
| `toggle`    | Stores timeline completion                                           |

Bound legacy artifacts use the existing `artifact` turn. Mutations check ownership, version, surface identity and permitted node operation. They persist without model or Qloo calls, then emit an ordinary `done` task snapshot. Failed or conflicting writes retain the visible draft and reload the latest server state through the existing controller.

The next model turn receives current canvas content, selected objects, place order, filters and completed steps through `modelContext`. New compositions preserve the previous four compositions; switching display tabs does not restart the task. Greeting turns and inference failures retain the canvas.

For existing cultural workflows, a controlled adapter binds returned artifacts and candidate IDs to the vocabulary. It refreshes its bindings after tool revisions without replacing user selections. Model-authored compositions take precedence. No keyword-based page selector is used.

## Google Photorealistic 3D Maps

`IgorSpatialCanvas` is lazy-loaded only for a `spatial` node. The Google library is loaded only when the user opens that map, so unrelated requests and merely scrolling past the canvas do not create map sessions.

Locations come exclusively from current stored candidates with source-supplied coordinates. Marker and place-list selections persist to the same task. The editable place order is also shared with the model. Camera movement respects reduced motion; a 2D map and external place links are available as fallbacks. Google's map element retains provider attribution and controls. No routes, travel times, opening hours or availability are inferred.

Configure a **referrer-restricted browser key** with Maps JavaScript API access as `GOOGLE_MAPS_BROWSER_API_KEY` in the server environment, or `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. The session-scoped `/api/maps/config` endpoint returns only that deliberately public browser key. It never reuses Qloo or model credentials. Do not put a server-only Google key in this variable.

Live Google imagery is **not verified in this change**. No authorized deployment environment connection or browser key was available locally. Browser verification stubs the Google library, not the task API, and makes no paid Maps or Qloo calls. The configured deployment must still verify API enablement, key referrers, billing and actual device support.

## Verification and limits

- New unit checks cover model transport composition, UI-to-agent continuity, persistence, retained work after failure, version/ownership rejection, invalid layout fallback, schema restrictions, greetings and research without Qloo.
- Desktop 1440 px and mobile 390 px browser checks exercise live preview, draft save, timeline reorder/completion, shared table/chart filtering, map selection, place ordering and reload restoration through the real task API and SQLite. Google itself is a labelled test double.
- Existing available regression tests pass. The full archived-Qloo regression group cannot run locally because the connector cannot materialize `tests/fixtures/qloo-cultural.json.gz` (1.3 MB binary); the file is unchanged in GitHub. Existing CI has the repository fixture and should run those checks.
- Full-repository ESLint also reports existing errors in the legacy homepage/product surface and globe files. Newly added implementation files are checked separately. No blanket suppression or unrelated formatting refactor is included.
- This is a branch/PR change. It is not a claim of production rollout or physical-device testing.

The existing engine has no general live web-research tool, attachment/voice pipeline, durable execution cancellation or generic approval-request mechanism. This UI does not simulate those capabilities. General laptop advice can compose comparisons without Qloo; current specifications and prices need retrieved or user-supplied evidence. Existing tools produce real activity records. New approval controls should be added only alongside a real, authorized approval protocol.

Run `npm test -- tests/unit/presentation.test.ts`, `npm run typecheck`, `npm run build`, and `npx playwright test --config tests/canvas.playwright.config.mts` for focused checks.
