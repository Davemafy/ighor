# PR21 verification — continued integration, 28 October 2026

**Draft only. No merge, deployment, credentials, visibility or submission changes.** Continues the existing integration branch; no new implementation PR.

## Acceptance correctness

Removed lexical completion detection from `agent-acceptance.ts`. A bounded model interpretation now declares the current turn's cultural decision, active reference names (including conversational replacements) and required deliverable keys. Missing/failed interpretation remains unknown. Requirements are persisted on the server-owned run and are supplied to the next action decision. Provider fallback supports this read-only interpretation.

Completion requires each declared deliverable to be bound to a current saved/revised artifact. Cultural decisions require selected candidate IDs and cited evidence whose provider/query/scope/candidate identity, freshness, delivery and seed IDs agree. Every active named reference must resolve and be covered by the current decision's cited signals. Unrelated stored evidence, an entity lookup, uncited signals and stale records cannot satisfy this check. If the executor actually invokes cultural discovery, server-owned seed receipts require cultural grounding even if the interpreter mistakenly declared it unnecessary.

Regression coverage uses the Brooklyn request without “Qloo”, then replaces Radiohead with Bad Bunny while retaining Sade/Wong Kar-wai. Old Radiohead-only coverage fails; correctly bound new coverage passes; stale/uncited evidence fails. An actual executor + SQLite reload regression confirms that a saved Bad Bunny revision without new supporting evidence remains partial, keeps artifact identity, preserves the $3,000 constraint and retains independent locked work exactly. These are **unit provider-boundary fixtures**, not live cultural proof.

Limit: this verifies typed evidence/decision dependencies and execution obligations, not semantic truth of every generated sentence or independently validated production feasibility. Interpretation itself remains model-dependent. An unsupported or unresolved cultural reference must remain unknown; no representative film/director identity is silently invented.

## Working interaction

Fluidkit **0.5.0**, MIT, uses the existing Motion peer rather than a second animation engine. Its surface-tension `LiquidSwitch` now controls actual “Include in comparison” state in a candidate inspector. The material stretches into a neck, breaks into departing bead/thumb/satellite shapes and reunites at the opposite well. Labels and native switch input remain crisp HTML; the server still owns comparison IDs. Toggling back uses native keyboard Space in browser verification.

This implementation uses **flat material**, not claimed refractive optics. Liquefy was removed. QuickLiquid was evaluated and rejected: its group scheduler calls `updatePositions()` each frame, which marks work pending again, preventing idle sleep. Neither its group nor a custom fluid engine was shipped. No WebGL/maps context was added. Reduced motion snaps directly while preserving operable semantic controls. The renderer settles after the bounded interaction; there is no ornamental infinite loop.

Verified in Chromium at 1440×900 and 390×844, plus mobile reduced motion. Tests check temporal clip-path variation with curved bridges, final settled geometry, native switch state, Escape/focus return, server-backed selection/comparison, reload identity, readable controls, no horizontal overflow and zero page errors. All three pass. The task data is **SAMPLE**, explicitly labeled; these recordings are not the Brooklyn flagship.

## Verification matrix

| Check                                                       | Current result                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Typecheck                                                   | PASS                                                                                                               |
| Format                                                      | PASS                                                                                                               |
| Lint                                                        | PASS, zero errors / 24 warnings                                                                                    |
| Production build                                            | PASS, Next16/React19; Fluidkit shares Motion14.7.1                                                                 |
| Unit suite                                                  | 424 passed / 1 failed assertion; five additional suites cannot load their archive, six red files total             |
| Targeted acceptance/executor/provider/connected-work checks | 60 passed before the additional persisted-revision test; final critical slice 16 passed including it               |
| Evaluation harness                                          | 6 passed; not an effectiveness experiment                                                                          |
| Full existing browser suite                                 | **16 passed / 10 failed**, all ten fail explicitly on missing original archive                                     |
| Fluid + continuity browser suite                            | **3 passed**, desktop/mobile/reduced motion, real screenshots/video/traces                                         |
| Credentialed flagship                                       | **BLOCKED**; no Qloo, Gemini, xAI/Grok or Anthropic key in runtime; no local credential file beyond `.env.example` |
| Same-pool Qloo/no-Qloo evaluation                           | **BLOCKED / not executed**; no ranking result, improvement number or effectiveness claim                           |
| Original cultural archive                                   | Retained in repository, unavailable to this host; authentic search archive and available fixture hashes retained   |
| Hosted CI                                                   | Not used as code proof; prior base job had null steps/logs. Local failures above remain release blockers           |

The exact twelve original failures, their causes, migrations and current disposition are in [BROWSER_FAILURES.md](BROWSER_FAILURES.md). Nothing was deleted/skipped to turn the suite green. Migrated archived journeys remain unverified past the integrity gate until the original bytes are restored. Unit integrity failures are retained.

## Diff review

Functional changes remain concentrated in the executor/requirements, tool bindings, protected revisions, current workspace controls and verification tests. No replacement task store or interface architecture was introduced. The initial mechanical ESLint/Prettier cleanup remains a separate reviewable commit; it accounts for much of the wide diff. The generated globe coordinate file's unrelated reformat was reverted to its source bytes and is explicitly excluded from formatting as generated data. Landing visual behavior was not redesigned. Existing license/workflows/provider boundaries remain.

Source scan found no key-shaped xAI/Anthropic/Google/OpenAI literals in source, tests, scripts, docs or workflows during the initial pass. This is bounded scanning, not an exhaustive public-release certification. No secrets were read or changed for these tests.

## Real evidence

- [Fluid desktop recording](evidence/one-chat/fluid-desktop.webm)
- [Fluid mobile recording](evidence/one-chat/fluid-mobile.webm)
- [Reduced-motion recording](evidence/one-chat/fluid-reduced.webm)
- [Desktop control capture](evidence/one-chat/fluid-desktop.png)
- [Mobile control capture](evidence/one-chat/fluid-mobile.png)

Playwright traces are generated locally under `test-results/integrated/`; recordings show the genuine running Next app. No generated renders are verification evidence.

## Release checklist

- [x] Correct provider-independent interpreted acceptance and decision-linked cultural evidence checks.
- [x] Brooklyn/Bad Bunny regressions, saved revision identity, budget and locked-work retention.
- [x] Repair current-selector tests and actual budget-summary loss; preserve test intent.
- [x] One real semantic fluid split/rejoin with native controls, reduced motion and browser recording.
- [ ] Recover original gzip and pass all integrity/unit/browser gates; verify migrated recorded journeys beyond preflight.
- [ ] Configure authorized credentials in a private review runtime, without putting secrets in source/chat.
- [ ] Run the **same** model-driven Brooklyn journey through actual Qloo discovery, defensible selection, proposal/budget/pitch, Bad Bunny revision and reload; retain LIVE/CACHED provenance.
- [ ] Run a genuine frozen-pool, identical model/constraints Qloo/no-Qloo comparison; publish actual rankings, source IDs and honest negative/inconclusive outcomes.
- [ ] Verify geo handoff where applicable, practical constraints, licensing/availability and final deliverable quality independently.
- [ ] Complete final public-source audit, setup/demo/submission review and owner approval.
- [ ] Only after approval: merge, deploy with SHA/rollback verification, change visibility or submit.

**This is not yet a verified flagship or submission-ready release.** The smallest next unblock is restoring the existing archive and making authorized providers available on a private review runtime. No additional infrastructure rewrite is needed to perform those checks.
