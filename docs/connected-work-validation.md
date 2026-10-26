# Connected-work backend verification — 26 October 2026

Base: `783565321b60cb7e80f85285e52a9cc132466569`, rechecked after the earlier d4e1333 review. All three reported defects were still present. No frontend component, renderer, visual layout or map implementation is changed.

## Implemented and tested

- Fixed the selected-candidate self-comparison; unselected unavailable references cannot receive selected-option availability claims.
- Fixed the memory-capacity self-comparison. New insertions over 100 are rejected atomically; updates at capacity work. Previously saved overflow memories remain readable.
- Non-destructive legacy artifact merge and prior-version archive; manually edited text is retained. Switching sample scenarios preserves accumulated conversation and connected work.
- Optional persistent connected goals, proposed/approved/rejected decisions, independently editable documents, dependency validation, evidence references, conflicts and revision history.
- Composition-only turns do not initialize cultural tools. Combined cultural/composition requests can retain useful independent work when cultural retrieval fails, with partial status and disclosure.
- Confirmed budget changes, deterministic percentage reduction and budget history; defaults are not treated as confirmed amounts. Existing structured budget controls update connected work without discovery.
- Dependency-based selective revision, approved-decision protection, manual-edit protection and infeasible approved allocation conflicts.
- Stable message IDs and additive structured activity metadata, retaining existing SSE outer event types and final state snapshots.
- Configured provider errors remain failures; unconfigured production runtime does not silently impersonate a model with scripted answers.
- External actions record blocked state and explicit reason. No external message, booking, purchase or payment was executed.

## Checks

| Check                                                           | Result                            |
| --------------------------------------------------------------- | --------------------------------- |
| Production build including Next TypeScript validation           | Passed                            |
| Explicit `tsc --noEmit`                                         | Passed                            |
| ESLint on all changed TypeScript files                          | Passed                            |
| Prettier on changed implementation/tests and interface contract | Passed                            |
| `git diff --check`                                              | Passed                            |
| Available unit suites                                           | 226 tests passed across 24 suites |
| New connected-work regression suite                             | 19 tests passed, included above   |
| Focused browser suite against production build                  | 2 tests passed                    |

Unit command:

```sh
npx vitest run --config tests/vitest.config.mts \
  --exclude tests/unit/recording-file.test.ts \
  --exclude tests/unit/broader-outcomes.test.ts \
  --exclude tests/unit/conversation.test.ts \
  --exclude tests/unit/recorded-workflow.test.ts \
  --exclude tests/unit/place-discovery.test.ts \
  --exclude tests/unit/recorded-conversation.test.ts
```

The six excluded suites require `tests/fixtures/qloo-cultural.json.gz`. The file exists in the upstream GitHub tree (1,315,454 bytes) but was unavailable in this local checkout; the connector's text reader failed to decode the binary gzip. These suites are **blocked locally, not passed**. No replacement recording was fabricated and the upstream file is not changed by the PR. Full `npm run verify:all` is not claimed to pass.

Focused browser command:

```sh
npm run build
npm run test:connected:browser
```

The new browser spec is also registered as `connected-work` in the existing Playwright configuration. The standalone configuration isolates its SQLite state and explicitly clears live credentials and Qloo call allowance.

## Browser scenarios

1. Through the existing `/app` composer: greet → request listening-bar concept → create eight connected documents → confirm $1,000 → approve musical identity → manually edit invitation → reduce budget 30% → reload. Verified $700 confirmed budget, $1,000 prior budget, unchanged approved identity, unchanged invitation wording, unchanged concept revision, revised budget document with prior version, persistent state and zero Qloo requests. Browser runtime errors were checked in this scenario.
2. Through the existing composer: retain an unrelated listening-bar project → request framework recommendation → approve the recommendation → change audience to beginners and shorten report. Verified stable report identity, incremented revision, prior content retained, approval preserved, unrelated documents unchanged and zero cultural calls.

Both browser scenarios use explicitly labeled scripted/recorded development examples. The framework example is **not live research**. A separate mocked Gemini transport test verifies the production decision envelope accepts connected-work actions, but no live model quality test was run.

## Integration and limits

See [agent-ui-contract.md](agent-ui-contract.md) for actual routes, fields, sample payloads, event states, revision/conflict handling and reconnection behavior.

- The UI session still owns adaptive renderers, approval/conflict controls, revision browsing and maps. Browser checks prove chat-to-backend mechanics, not those new renderers.
- No live web research or cross-app connector is implemented. New permissions cannot be granted by model output.
- Existing sharing/export snapshots are not expanded to include connected documents. Their integration remains explicit follow-up work.
- Restoration uses GET snapshots; no durable event replay queue is implemented.
- Budget is workspace-wide, in the existing USD currency. Per-goal budgets are not implemented.
- Live Qloo/model behavior and recommendation usefulness remain unverified in this change; no API credits were consumed.

## Migration and deployment

No destructive SQL migration is required: optional additive state lives in the existing tasks JSON. Legacy tasks remain readable, and missing work/history is not invented. Back up SQLite before eventual deployment. Avoid rolling back to an older writer that strips the new optional fields without preserving their JSON. This work is a PR only; it is not merged or deployed.
