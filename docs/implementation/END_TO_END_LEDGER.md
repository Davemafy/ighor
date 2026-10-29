# End-to-end implementation ledger

Baseline inspected: `64615cf48adb7092654ce5b9ad6a48e1d71ecd86`, PR #27,
`feat/partiful-codrops-unified-20261029`. The source is newer than the mission's
prepared baseline. No old branch or rejected visual system is being restored.

| Area                              | Baseline                                                   | Current action / evidence                                                             |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Accepted messages / dedupe        | Implemented; no initial journal event                      | Add atomic first event, lease identity and late-worker fence                          |
| Run lifecycle / reconnect         | Partial; interruption inferred from age                    | Persist expired-lease recovery, partial/input states, SSE IDs and paginated snapshots |
| Conversation focus                | Partial; ordered IDs, limited references                   | Inspect revision-bound references and supplied assumptions next                       |
| Single runtime / Qloo / TrueForge | Existing bounded loop + capabilities; delegation opt-in    | Reuse adapters; independent live acceptance requires credentials                      |
| Experience graph / critique       | General decisions/documents; incomplete cross-domain model | Add typed, evidence-bound composition within current WorkState                        |
| Product / regression              | Partiful/Codrops retained; native invite CI red            | Fix fixture DB binding without weakening the no-placeholder assertion                 |
| CI / live / hosting               | Last external CI red; volume/live prerequisites unverified | Use qloo-test exact SHA; no deployment or secret changes                              |

## Foundation implementation

- Admission, user message, lease identity and first journal event share one SQLite
  transaction. No external inference occurs inside it.
- Additive migrations preserve existing tasks and old journal rows. A 60-second
  worker lease is renewed by the live request heartbeat. After a database reopen,
  expired work is durably marked interrupted, preserving messages and checkpoints.
  This is interruption recovery, not automatic paid-tool resumption.
- Every API worker saves through an owner/workspace/run-scoped lease fence and
  the existing optimistic version guard. Accepting a newer correction supersedes
  prior runs; late workers cannot commit after lease expiry or supersession.
- Existing SSE action/state/done/error packet types remain. New action metadata
  records actual phases; live delivery and replay use stable ordered event IDs.
  Journal reads return an authoritative snapshot, last cursor and pagination flag.
- The browser retains only pending turn identity/cursor, can restore saved events
  after reload, and does not replay POST or paid operations to recover a connection.
- Inherited native-invite failure was a fixture binding error: the test wrote to
  `.igor/integration-browser`, while its server uses `.igor/e2e/recorded`. The
  corrected setup asserts exactly one fixture row was updated. UI behavior and
  the original no-placeholder assertions remain intact.

## Verification so far

- Foundation/stream/fetch unit tests: 22 passed locally.
- Local broad unit attempt: 475 passed; six suites blocked by the original
  `qloo-cultural.json.gz` being unavailable through the local connector. No
  synthetic replacement was created; qloo-test must check the original archive.
- Typecheck passes. Final CI/browser/live results will be recorded at their exact
  source SHA. No local model, Qloo or TrueForge credential binding is available.

## Integrated experience graph

- Extend the existing WorkState schema with optional typed domains, rationale
  kinds, candidate bindings, alternatives, schedules and alcohol restrictions.
  Old saved work remains readable. No new runtime or database is introduced.
- `experience.compose` writes actual connected decisions and editable documents;
  `experience.critique` independently checks budgets, schedule collisions,
  current query/candidate evidence, cultural domain misuse, alcohol constraints,
  dependency coherence and practical unknowns. Hard issues block completion.
- The agent acceptance boundary reads those same documents (no duplicate artifact
  store), checks interpreted domain requirements and retains LIVE/CACHED/RECORDED
  evidence provenance. Internal work does not consume provider request budget.
- Budget-only correction reevaluates the saved candidate pool without Qloo calls.
  Approved decisions and manual wording survive selective invalidation. Fixed a
  double-invalidation bug that made newly recomputed decisions stale and a budget
  warning that incorrectly modified zero-cost, unrelated decisions.
- Focus no longer revives stale choices through a catalogue fallback. Current
  replies cannot cite stale evidence. Saved focus includes goal, decisions, open
  questions, unresolved assumptions and explicitly confirmed preference IDs.

## Architecture-to-code map

| Contract                                     | Implementation                                                | Regression evidence                                            |
| -------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Admission, lease, fencing, recovery          | `src/data/store.ts`, `src/core/turn-lifecycle.ts`, turn route | durable-turn, turn-recovery, turn-reconnect                    |
| Ordered progress and reconnect               | turn route, workspace-api, use-workspace                      | workspace-stream, turn-reconnect                               |
| Interpretation and focus                     | interpret-message, conversation-focus, model-context          | conversation-reply, conversation-focus, interpretation-failure |
| Bounded composition and acceptance           | unified-agent, agent-tool-registry, agent-acceptance          | unified-agent, agent-acceptance, experience-graph              |
| Connected decisions and independent critique | work-contracts, connected-work, experience-critique, revision | connected-work, experience-graph                               |
| Existing product rendering                   | connected-work-canvas                                         | connected-work browser suites                                  |

Local graph/focus/acceptance checks: 51 passed. Broad local run: 486 passed;
six suites blocked solely by the unavailable original cultural archive. This is
not a passing full suite. Typecheck passes; lint has 0 errors (27 existing warnings).
The new two-goal engine tests use explicitly mocked query evidence; they are not
live Qloo demonstrations. External exact-head checks remain pending.

Live model/Qloo and TrueForge are BLOCKED locally: no authorized binding is
present. Railway volume mounting and backup/restore are unverified because this
session has no hosting access. No production deployment or secret change occurred.

## Live execution boundary diagnosed

At source `497e62f`, bounded authorized live acceptance resolved all three anchors
and completed `qloo.discover` (4 provider requests). It then failed at the next
model decision with safe category `provider timeout`; no action was selected or
artifact saved. Acceptance remains FAILED, not a Qloo-resolution success claim.
The chooser forced a 15-second transport deadline despite Gemini's configured
80-second outer limit. It now uses the configured limit less a 5-second margin,
with no automatic retry or increased request count. A fake-clock regression
reproduces a valid composition response at 16 seconds in one request. The argument
JSON envelope also permits the already-declared 12k document size plus metadata;
actual tool argument, source and permission schemas remain unchanged.

Paid-read exhaustion now removes paid tools while leaving internal composition,
critique and saving available. A regression proves an observed source can be saved
at the exact provider cap without another paid read. Provider/deadline regressions:
36 passed locally before the envelope-boundary extension; final exact-head CI
is required. Desktop/mobile connected-work browser suite: 6 passed locally.
The full external browser suite on `497e62f` has reached the separate mobile
acceptance gate; final terminal status is still pending.
