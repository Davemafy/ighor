# FRONTEND_COMPONENT_MAP

**Branch baseline:** `design/mockup-to-native-ui-20261029` (stacked on PR #27).  
**Design authority:** all 12 owner-provided references.  
**Data authority on this branch:** `TaskSchema` in `src/core/contracts.ts` through the existing authenticated task/turn/journal APIs. `WorkspaceSnapshotSchema v1` is upstream work and is **not present** in PR #28's current base.

The frontend is a **projection** of one canonical task, not twelve stores. Screens are capabilities and compositions, not a rigid route sequence.

## Current code that must be reused

| Existing module                                                      | Responsibility                                                                                                          | Design adaptation                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/core/contracts.ts`                                              | Task, participant, candidate, evidence, artifacts and turn type schemas                                                 | **Do not modify** as part of UI work                                              |
| `src/core/workspace-snapshot.ts` (upstream only)                     | Proposed read-only projection, absent from this branch                                                                  | Do not import until integrated in a compatible engine update                      |
| `src/core/presentation.ts`                                           | Finite declarative vocabulary: text, findings, sources, tables, chart, document, timeline, discovery, spatial, question | Adapt stable semantic objects, not raw LLM text or HTML                           |
| `src/components/workspace-api.ts`                                    | Authenticated canonical Task load, history, turns, SSE, recovery journal and optimistic versioning                      | Reuse existing transport; do not call nonexistent snapshot endpoint               |
| `src/components/use-workspace.ts`                                    | Workspace identity, turn events, recovery, task state                                                                   | Single authoritative state hook, no Zustand duplication                           |
| `src/components/agent-workspace.tsx`                                 | Navigation, thread, local presentation routing, results and saved work                                                  | Decompose monolith incrementally; preserve all behavior                           |
| `src/components/task-canvas.tsx`                                     | Declarative work rendering/mutations, version selection                                                                 | Style presentation primitives and maintain node IDs                               |
| `src/components/connected-work-canvas.tsx`                           | Structured document/work authoring                                                                                      | Center-stage Create/work layout with live saving                                  |
| `src/components/decision-work.tsx`                                   | Domain-neutral choices/comparisons                                                                                      | True aligned comparison and evidence details                                      |
| `src/components/igor-spatial-canvas.tsx`                             | Google Maps 2D/3D adapter and markers                                                                                   | Reskin; constrain pins via snapshot geocoded IDs                                  |
| `src/components/research-discovery.tsx`                              | Evidence-bound research cards, source checks                                                                            | Curated discovery layouts without false trending claims                           |
| `src/components/discovery/dialog.tsx`                                | Contextual detail interactions                                                                                          | Consistent detail inspector/source presentation                                   |
| `src/components/invitation-studio.tsx`                               | Editable invitation scene                                                                                               | One specific Create mode, not universal default                                   |
| `src/components/use-saved-outcomes.ts`                               | Saved collections/output workflow                                                                                       | Use real saved data; no browser-only pseudo-library                               |
| `src/components/mobile-transitions.ts`                               | Transition and state preservation                                                                                       | Reduced-motion-safe change of view, no fabricated progress                        |
| `src/components/workspace-loading.tsx` / `turn-feedback.ts`          | Load, execution, interruption feedback                                                                                  | Communicate actual pending/completed/failed states                                |
| `src/app/workbench.css`, `native-workspace.css`, `mockup-native.css` | Currently competing visual systems                                                                                      | Consolidate selectors after reference comparison; avoid one more overriding layer |
| `public/marketing/assets/brand`, `fonts`                             | Approved identity material                                                                                              | Preserve logo and font files without redistributing them                          |

## Proposed component boundaries

| Proposed reusable component | State owner / contract                       | Applicable screens     | Implementation rule                                             |
| --------------------------- | -------------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `IgorShell`                 | transient view and navigation only           | All                    | One route/navigation system, desktop rail + mobile bottom nav   |
| `AgentComposer`             | draft transient; action uses `TaskAction`    | 01, 03, 11, mobile     | Multiline, keyboard, failure-safe and preserved draft           |
| `MediaView`                 | media object from real candidate/artifact    | 01, 02, 04, 07, 09, 10 | Purposeful crop and loading; no source misattribution           |
| `DiscoveryRail`             | collection of canonical IDs + evidence       | 02, 03                 | Trending vs personalized contracts explicitly separated         |
| `CandidateCard`             | canonical candidate, source/evidence ID      | 02, 03, 08, 10         | Image, title, actions and provenance share identity             |
| `ParticipantStrip`          | `snapshot.participants`                      | 03, 04, 08             | No generated fictional identities unless fixture labeled        |
| `EvidenceInspector`         | `snapshot.discovery.evidence`                | 03, 08, 10             | Query-scoped raw values and honest missing information          |
| `WorkStage`                 | `snapshot.plan` and declarative canvas       | 03, 04, 07, 11         | Task-appropriate type: document/table/chart/plan/map            |
| `OutcomeTabs`               | available work/plan artifacts                | 04, 07                 | Only show tabs that have corresponding data                     |
| `PlanTimeline`              | `snapshot.plan.schedule`                     | 04, mobile             | Unknown times stay unknown; real mutations                      |
| `SpatialView`               | `snapshot.spatial` and selected candidate ID | 05, 06, mobile         | One location set, 2D/3D toggle and accessible list fallback     |
| `PlaceInspector`            | candidate ID → candidate with geocode        | 05, 06                 | List/marker selection sync; no fake nearby location             |
| `ArtifactEditor`            | `snapshot.artifacts.current` + work actions  | 07, mobile             | Server-saved version, dirty/pending/blocked states              |
| `ComparisonMatrix`          | ordered canonical candidate IDs              | 08, mobile             | Source-backed rows; no invented weighted 'compatibility'        |
| `LibraryGrid`               | saved actual task summaries/output           | 09, mobile             | Persisted reopenable objects, type filters, no local fake store |
| `CandidateDetail`           | candidate, source IDs, scoped signals        | 10                     | Actual source tabs only when data exists                        |
| `RevisionSummary`           | task/work/artifact snapshots and diff        | 11                     | Actual additions, removals and preservation                     |
| `VersionTimeline`           | artifact history + server version            | 11, mobile             | Restore only if server mutation exists; otherwise read-only     |
| `SourceStatus`              | LIVE/CACHED/current/stale/source/error       | 02,03,08,10            | Explicit trace/provenance, no hypothetical confirmations        |
| `MobileWorkSheet`           | selected object in transient UI              | 12                     | Drilldown on same task objects, focus restored on close         |

### Shared view adapter (P0)

A small pure client-safe module accepts `unknown`, validates `TaskSchema`, produces stable selectors, and exposes:

- `id`, `revision`, `state`, `goal` and saved conversation.
- `candidates`: deduped by ID, evaluated records preferred.
- `participants`: explicit names/preferences only.
- `evidenceById`: actual persisted evidence, with freshness/delivery.
- `mapPlaces`: only entries present in `spatial.geocodedPlaceIds` and with finite/valid coordinates.
- `artifactVersions`: current+historical content with exact versions.
- `visibleWork`: use existing declarative `PresentationSchema` rather than string parsing.
- `error` and `warnings`: preserve raw status and indicate unknowns.

A read-only adapter **must not** synthesize scores, participant rankings, an activity timeline, restaurant availability, city coordinates, or saved outcomes. Task writes stay exclusively in `workspace-api.ts`.

## Screen-to-component mapping

| Screen          | Composition root      | Components                                                                        |
| --------------- | --------------------- | --------------------------------------------------------------------------------- |
| 01 Home         | CinematicEntry        | IgorShell, AgentComposer, StarterAction, MediaView                                |
| 02 Discover     | DiscoveryWorkspace    | IgorShell, DiscoveryRail, CandidateCard, EvidenceInspector                        |
| 03 Conversation | ConversationWorkspace | AgentComposer, ConversationThread, ParticipantStrip, EvidenceInspector, WorkStage |
| 04 Plan         | ConnectedOutcome      | OutcomeTabs, PlanTimeline, WorkStage, ConstraintStatus, MediaView                 |
| 05 2D map       | MapWorkspace          | SpatialView, PlaceInspector, PlacePreview                                         |
| 06 3D map       | ImmersiveSpatial      | SpatialView, PlaceInspector, MapFallback                                          |
| 07 Create       | CreateWorkspace       | ArtifactEditor, WorkStage, InvitationStudio where relevant                        |
| 08 Compare      | ComparisonWorkspace   | ComparisonMatrix, CandidateCard, EvidenceInspector                                |
| 09 Library      | LibraryWorkspace      | LibraryGrid, SavedWorkCard, WorkPreview                                           |
| 10 Details      | EntityDetailWorkspace | CandidateDetail, EvidenceInspector, SourceStatus                                  |
| 11 Revise       | RevisionWorkspace     | RevisionSummary, VersionTimeline, AgentComposer                                   |
| 12 Mobile       | MobileCompositions    | MobileWorkSheet + _same roots/models_                                             |

### Snapshot v1 limitation to resolve with engine owners

On the currently checked-out frontend base, `src/core/workspace-snapshot.ts` and `/api/tasks/:id/snapshot` are absent. The implemented adapter `adaptTaskForPresentation` therefore validates the existing `TaskSchema` returned by `/api/tasks/:id`, which already includes the declarative canvas and all grounded task data. A later snapshot integration requires an explicit engine branch reconciliation; never import a module that is absent from this PR base.

## Interaction topology

1. **Entry:** free text or starter → existing authenticated task turn; no Qloo-required intake for arbitrary prompts.
2. **Discover:** snapshot candidate ID → details, evidence, compare or selection; never clone candidate by title.
3. **Compare:** ordered ID set → source-backed row data → selection `TaskAction`.
4. **Create:** selected IDs → work/artifact contract → native edits through existing versioned mutations.
5. **Revise:** requested delta → server-confirmed changed task → new snapshot → compute changed/preserved IDs; no optimistic 'Done'.
6. **Resume:** stored task ID → snapshot/recovery journal; no retry POST for a turn that may have already committed.
7. **Spatial:** one geocoded candidate set is shared among 2D, 3D, plan and details.

## Integration and parallel-work boundaries

- Base this child branch on PR #28; target the draft PR back to `design/mockup-to-native-ui-20261029`. The PR diff then contains **frontend-only changes**; nothing merges PR #27 into `main`.
- Keep PR #30 separate, unmerged; selectively inspect it for possible useful interactions, but do **not** copy its hardcoded cultural images or browser-local favorite semantics as authoritative saved work.
- The snapshot contract is still additive and may change while the engine branch evolves; check upstream SHA before integrating. Do not edit orchestration, provider keys, persistence internals or production config.
- One canonical `Task` and `WorkspaceSnapshot`; UI local state is selection, tab, filter, form draft and animation **only**.

## P0 behavior acceptance

- **General prompts:** `Research a battery chemistry paper` enters conversation with appropriate generic presentation and no event-planning intake.
- **Cross-person evidence:** actual participant rank/affinity belongs to its own query; missing values render 'Unknown', not zero.
- **Selective revision:** only dependent objects change; old saved artifact content remains recoverable; no success before canonical confirmation.
- **Geography:** unverified coordinates excluded from pins; 3D unavailable → 2D/list.
- **Recovery:** offline/interrupted SSE journal resumes previous context with no duplicate POST.
- **Mobile:** same server state, functional actions, keyboard and screen-reader accessible.
