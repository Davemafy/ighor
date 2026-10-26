# Igor product interface — Partiful reference map

Status: approved reference direction; screen specification for the next product build. This document does not claim that the replacement screens are implemented.

## Product promise
Bring a goal. Igor connects taste intelligence, practical research and editable work. Discover, Compose, Collaborate and Evaluate are capabilities inside one flow, not four separate tools.

## Reference evidence
Reviewed the supplied Partiful recording (2026-10-26 084733, 206 seconds), including dense editor frames.

- 160–184s: Explore has a narrow fixed left rail, a photographic entry, generous side margins and horizontal collections. Adapt the browsing hierarchy and card interactions to ideas and saved work. Do not copy event categories or fabricate listings.
- 194–196s: editable details on the left, a large live artifact on the right, a separate narrow tool strip, and a persistent save action. Use this composition for Igor's output editor.
- 198–206s: the artifact remains central while typography, theme and effects change around it. Use immediate preview and contextual controls. Do not add decorative effects before the core editing works.
- Navigation, overlays and form controls stay consistent across these surfaces. The website's marketing capsule is not the product navigation.

## Navigation and routes
Desktop: 68px left rail, Igor mark at top, Explore, Conversations, Saved, New goal; account/session control at bottom. Hover labels and persistent active state. Mobile: compact top bar plus bottom navigation, no squeezed desktop panels.

| Surface | Proposed route | Main action | Exit |
|---|---|---|---|
| Marketing | / | Try Igor | /app |
| Explore | /app | Start an idea | conversation |
| Conversation | /app/conversations/:id | Continue the goal | result or output |
| Saved | /app/saved | Resume a collection or conversation | detail |
| Output editor | /app/conversations/:id/edit/:outputId | Edit and save | preview |
| Output preview | /app/conversations/:id/preview/:outputId | Review, export or share | editor or conversation |
| Shared review | /review/:token (existing) | Comment or propose a preference | submitted state |
| Legacy workspace | /workspace | Redirect to /app | no second workspace UI |

Only /, /app and the existing review route are currently established. Proposed nested routes must restore persisted state and support back/forward navigation when implemented.

## Screens and transitions

### 1. Explore
Partiful's visual discovery composition, adapted to Igor. One strong introductory image or locally composed artwork, a small goal composer and editorial rows: Start with a taste; Make something; Plan together; Continue where you left off. Rows scroll horizontally without hijacking vertical scroll. Every card has a concrete action, useful label and actual preview. Sample ideas are explicitly examples; saved work uses the owner's persisted data. No invented recommendations, popularity counts or social proof.

### 2. Start a goal
The composer accepts a normal message. Example cards prefill a starting point the user can change. Sending creates/continues a task and opens its conversation. Ask for one missing detail only when needed. Taste, location, budget and people appear as editable context after supplied; do not require a long intake form or infer user preferences from sample profiles.

### 3. Conversation
One readable chronological thread, a pinned composer and an optional work preview. On desktop use a conversation column and a generous output region; on mobile switch between Conversation and Work with preserved scroll positions. A new message stays visible while work proceeds. Show actual execution events, partial results and recoverable errors. Previously saved results remain readable during failures. No fake completion animation or endless spinner.

### 4. Results and detail
Use a visual row/grid with compact metadata and explicit shortlist/inspect controls. Selecting a result opens a roomy detail surface; back returns to the same card and scroll position. Show original Qloo images when supplied, useful text fallbacks otherwise. Separate Qloo cultural evidence from practical research and user facts. Inspect source, retrieval date, missing facts and reason for fit. A place can lead to an artist or film without falsely turning that context into a person's preference.

### 5. Output editor
Use Partiful's editor proportions: editable content on the left, large artifact preview on the right, contextual tool strip at the far edge. For an invitation show title, body and optional supplied details; for a plan show reorderable entries and notes; for a collection show selected results. Expose relevant controls only. Text changes update preview immediately. Show dirty, saving, saved, failed-save and version-conflict states. Preserve unsaved content on failure. Typography must remain native selectable text.

### 6. Refine connected work
Keep the active artifact visible. A follow-up such as “Make it quieter. Keep it under £80” updates only affected work. Mark what changed and what was retained; let the user inspect the revised output. Do not claim an undo/version-history capability until persistence supports restoring a prior version. Never mark the budget or opening hours verified merely because a revision requested them.

### 7. Saved
A visual library of actual saved collections plus resumable conversations. Empty state offers a first goal. Open restores the exact persisted work. Rename/reorder/notes/delete use the collection API; source-changed collections carry a clear indicator. Do not present saved collections as external bookings.

### 8. Preview, share and review
A clean artifact preview with Edit, Export and Share. Sharing selects the supported artifacts and participant, then returns the existing review link. Show expiry/revocation. Recipient review shows only the selected material, with comment/preference proposal controls. Owner sees pending proposals and chooses whether to apply them. Never apply another person's suggestion silently.

## Existing API bindings

| Need | Existing contract |
|---|---|
| Create/resume/list conversation | POST/GET /api/tasks; GET /api/tasks/:id |
| Message, selection, preference, connection, refinement | POST /api/tasks/:id/turn; existing TaskAction schema; version required |
| Execution feedback | SSE action/state/done/error events; use-workspace + workspace-api |
| Collections and review state | GET /api/tasks/:id/outputs |
| Save/rename/reorder/remove collection | POST outputs: collection, update-collection, delete-collection |
| Share/revoke/apply review | POST outputs: share, revoke, accept-review |
| Export | Existing /api/tasks/:id/export; inspect supported formats before offering controls |
| Session/account | Existing /api/account; do not invent authentication promises |

Reuse these contracts and ownership checks. Read the exact artifact action types before implementing editor persistence. A proposal in this map is not evidence of backend support.

## Required states
For every network surface: initial load, empty, working, partial, success, unavailable, retry and stale/conflict. For every overlay: keyboard entry, focus trap, Escape, focus return and mobile full-screen presentation. For forms: labels, invalid values, unsaved changes and save failure. Offline and expired review links have useful exits. Never erase useful work during a failed operation.

## Visual and interaction rules
Use the Partiful product references, Igor branding and one consistent Lucide 24px icon family (round terminals, consistent stroke). No mixed emoji/icon glyphs. Persistent visible labels for primary navigation on mobile, accessible labels for icon buttons. Generous composition spacing; avoid filling every available region with cards. Use real photography for people. Keep metadata secondary and actual outputs dominant. No globe, FingerTrip palette, split-flap typography or borrowed flight-dashboard styling.

## Build order and completion gate
1. Retire legacy workspace entry; remove the globe.
2. Implement the shared responsive shell, Explore and Saved using persisted data.
3. Integrate the conversation and results into that shell, preserving threads and versioned API calls.
4. Build one complete editable output (invitation), then plan and collection editors with their supported actions.
5. Complete preview/export/share/review and recovery states.
6. Compare desktop and mobile views against the specific Partiful recording frames; exercise one continuous journey from a goal through saved/editable/shared work. A restyled landing page or static mockup does not satisfy this product build.
