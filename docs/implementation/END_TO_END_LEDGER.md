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

- Foundation/stream/fetch unit tests: 19 passed locally.
- Local broad unit attempt: 475 passed; six suites blocked by the original
  `qloo-cultural.json.gz` being unavailable through the local connector. No
  synthetic replacement was created; qloo-test must check the original archive.
- Typecheck passes. Final CI/browser/live results will be recorded at their exact
  source SHA. No local model, Qloo or TrueForge credential binding is available.
