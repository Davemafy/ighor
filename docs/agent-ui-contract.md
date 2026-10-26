# Agent / UI contract: connected work

This is the implemented backend contract. No morphing UI, map, renderer or frontend state manager is changed by this PR. All document content is data/plain text, never executable UI code.

## Identity and lifecycle

| Concept          | Implemented field                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------- |
| threadId         | `Task.id` (one persistent workspace and conversation)                                        |
| taskId           | `Task.id`; connected goals additionally have `Task.work.goals[].id`                          |
| messageId        | `Task.messages[].id`; legacy messages get stable `${task.id}:message:${index}` IDs           |
| artifactId       | Legacy `Task.artifacts[].id`; connected documents `Task.work.documents[].id`                 |
| artifactRevision | Document `version`; prior versions in `history`                                              |
| rendererType     | Optional `Event.activity.rendererType` hint; frontend chooses the renderer                   |
| toolEvents       | `action` SSE packets with `activity.kind` tool-invocation/tool-result                        |
| statePatch       | `activity.statePatch` is a version/invalidation hint, not an executable JSON patch           |
| evidence         | `Task.evidence`; superseded records in `Task.evidenceArchive`                                |
| actionStatus     | Optional `activity.actionStatus`; work decisions also have proposed/approved/rejected status |

POST `/api/tasks` creates an existing workspace and session. No project setup is required. GET `/api/tasks/:id` restores the full owner-scoped state. POST `/api/tasks/:id/turn` accepts natural messages or structured actions with the current `brief.version`. Cookies and existing origin checks apply. A 409 means fetch the latest state before retrying; do not silently replay user actions.

The old brief/catalogue/selection engine remains available. Conversation-only turns do not initialize Qloo. Connected-work proposals bypass cultural prerequisites. A request may combine cultural actions with work actions: cultural capabilities run first, followed by the validated work proposals. Proposals cannot cite nonexistent future evidence. If the cultural step fails, independent creative work can still be saved with partial status and the unresolved step disclosed. This does not grant a research or booking connector.

## Persistent connected work

`Task.work` is optional for backward compatibility. It has `schemaVersion: 1`, `goals`, `activeGoalId`, `decisions`, `documents`, optional confirmed USD `budget`, `budgetHistory`, `changes`, and `externalActions`.

- IDs are lowercase slugs, stable across revisions and unique between work decisions and documents. `main` and `invitation` are reserved for legacy artifacts.
- A decision is a creative proposal, with `value`, `rationale`, optional estimatedCost (nullable), status and conflict. Approval records a user's decision; it does not verify supplier prices.
- Documents have content, basis, status, edited, freshness, conflict, dependencies, evidenceIds, version and history.
- Dependencies use `goal:ID`, `decision:ID`, `document:ID` or `budget`. Cycles and nonexistent dependencies are rejected atomically.
- `evidenceIds` must reference current evidence when a proposal is applied. These identify the cultural records that informed the decision/document; association is not a causal explanation. A later evidence replacement invalidates affected connected documents and dependent documents. Old evidence is retained in `evidenceArchive`.
- Budget is user-confirmed, separately from model-authored cost allocations. Percentage cuts require a confirmed starting budget; editable defaults do not qualify. Old amounts are recorded in `budgetHistory`.
- Confirmed connected-work budgets also update the existing brief budget and invalidate dependent legacy records. Existing structured `constraints` budget edits route to the work budget without cultural discovery; affected documents stay stale until revised.
- The budget currently applies across this workspace. Independent budgets require separate workspaces; per-goal budgets are not implemented.
- Budget corrections run before proposed revisions. Unaffected existing documents/decisions are protected from incidental rewrites in that budget batch.
- Approved/rejected decisions are never silently replaced. An alternative is recorded as a conflict. Rejecting an approved decision is explicit user input.
- Manual/approved documents keep their content when a dependency changes. They become stale and carry a conflict/proposed replacement. The UI can present this for user review.
- `history` stores prior content/version and change reason. Revisions are not silently truncated; further edits fail at 100 prior versions. Work is bounded to 40 goals, 100 decisions and 100 documents; a turn has at most 16 work actions.
- Legacy generated artifacts are merged, not wholesale replaced. Changed versions are archived in `Task.artifactHistory`. Unregenerated artifacts survive, possibly stale. Manual wording is retained.

All work decisions/documents have `basis: creative-proposal`. This cannot assert retrieval, bookings, current prices or market demand. Budget is confirmed input; cultural evidence retains its existing provider/source metadata. Missing practical facts remain missing. The model writes qualitative interpretation, while the engine checks budgets, identities, approvals, dependency structure and evidence references.

## Natural conversation and model boundary

The configured model uses the existing `update_brief` function, with one JSON decision envelope. Ordinary conversation uses `intent: conversation` or `clarification`. Connected composition uses `intent: goal` or `revision`, `kind: creative`, `goal`, and `workActions`. The same actions below are accepted in that array. Existing cultural intents/operations continue to work.

A provider failure remains an error, with existing saved state preserved. No configured production failure falls back to a scripted response. Scripted behavior is available only for explicitly selected illustrative fixtures, recording/test modes or NODE_ENV=test. An unconfigured production model fails clearly instead of impersonating a live model.

There is no general web research connector in this application. An evidence-backed live research claim must not be made. The frontend-framework acceptance scenario uses a clearly labeled recorded development example to test composition/revision mechanics. It is not a current-source evaluation of frameworks.

## Streaming events

Transport stays SSE: `data: <Event JSON>\n\n`. Existing outer types remain `action`, `state`, `done`, `error`. `action.message` remains readable by old clients. The additive `activity` object is defined by `AgentActivitySchema`.

```json
{
  "type": "action",
  "message": "Budget allocation saved.",
  "activity": {
    "eventId": "thread-123:4:3",
    "threadId": "thread-123",
    "taskId": "thread-123",
    "sequence": 3,
    "kind": "artifact-revised",
    "actionStatus": "completed",
    "artifactId": "listening-bar-allocation",
    "artifactRevision": 3,
    "rendererType": "document",
    "evidenceIds": []
  }
}
```

`sequence` increases within one turn. `eventId` identifies a packet; do not treat sequence as a global cursor. Kinds are task-started, task-progress, message-added, tool-invocation, tool-result, evidence-added, artifact-created, artifact-revised, state-changed, approval-required, action-failed, task-completed. Statuses are proposed, awaiting-approval, executing, completed, failed, blocked.

Tool invocation/result packets wrap actual cultural provider operations. Invocation does not imply a network request: a cache or fixture may answer it. Request counts and LIVE/CACHED/source information remain in the existing trace/evidence. No invented percentages or fictional research progress are emitted. Provider execution errors remain failures; blocked external actions are explicitly blocked.

State changed packets contain, for example:

```json
{
  "version": 6,
  "changedPaths": ["messages", "brief", "work", "artifacts", "evidence"]
}
```

This is an invalidation hint. A final `done` contains the complete authoritative Task. `task-completed` means this turn finished, not that every proposed decision is approved or every real-world action is complete. Inspect task.status, freshness, conflicts and external action status.

## Display, edit, revision and conflict cycle

1. Read `done.task.work.documents` or restore GET `/api/tasks/:id`.
2. Render content as text. Respect basis, freshness, approved/manual status and conflict. Do not upgrade creative proposals to verified facts.
3. Submit a structured edit using the current optimistic version:

```json
{
  "type": "work",
  "version": 6,
  "actions": [
    {
      "kind": "edit",
      "id": "listening-bar-invite",
      "content": "Our exact invitation wording."
    }
  ]
}
```

4. The backend archives the prior content, increments the document version, sets edited, invalidates downstream documents and returns the new Task. Natural-language manual edits require the replacement wording verbatim.
5. Display prior revisions from `documents[].history`. Legacy versions are in `artifactHistory`.
6. For approval use `{ "kind": "approve", "id": "listening-bar-identity" }`; rejection uses `reject` for decisions. Approval of a stale/conflicted document is rejected. To resolve a document conflict, present proposed content and let the user explicitly save their chosen wording via `edit`, then approve it. No auto-accept operation exists.

Other work actions: `goal {id,title}`, `budget {amount}`, `reduce-budget {percent}`, `decision {id,title,value,estimatedCost,rationale,dependencies,evidenceIds}`, `document {id,title,content,dependencies,evidenceIds}`, `external {connector,action}`. These are discriminated by kind. Direct structured approval/edit is explicit user intent; model-proposed approval additionally requires explicit approval text identifying the target.

## Restoration and limits

GET restores the state, transcript, stable document IDs, revision history, changes, traces and evidence. Existing transport recovery already fetches saved state after interrupted turns. There is no Last-Event-ID replay endpoint or durable event queue; rebuild from GET instead of replaying requests. Notifications are derived from saved state and are delivered only around actual processing/save boundaries.

SQLite retains the existing tasks.state JSON column. Optional additive fields require no destructive SQL migration. Legacy messages receive stable IDs; old tasks remain readable without fabricated work or history. Snapshot exports/sharing retain their existing explicit public projection; connected documents are not yet included in those legacy export/share APIs. UI integration should not assume they are.

Back up SQLite before deployment as usual. Older application writers can strip unknown fields, so do not roll back to a pre-contract writer against a database containing new work without preserving those JSON fields. This PR is not deployed.

## Remaining integration gaps

The frontend session must add connected document renderers, approval/conflict controls and revision browsing using this contract. The current chat can show document proposals as assistant text; the backend browser tests use that real UI and inspect saved state. They do not prove the new morphing renderers.

No cross-app connector is implemented. External requests record explicit inputs and status blocked with a reason; no message, booking, purchase or payment is performed. No live web research is implemented. Qloo and model live quality/quota tests are outside routine fixture verification.
