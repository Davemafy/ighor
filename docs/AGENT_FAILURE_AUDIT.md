# Agent failure audit — current P0 patch

Base: PR #21 `18beb0619736dfc8b43737d193ca6b81cb6b7f4d`.

## Validated causes

The inherited ToolCallingModel default allowed six requests. Grok, Claude and Gemini all inherit that ceiling. The unified agent allows eight decision steps plus interpretation; routing, schema repair and synthesis also consume the same instance. This is a reproducible capacity mismatch, not proof of the deployed screenshot's specific cause.

The unified loop also imposed 18-second deadlines on adapters advertising 45 seconds (Grok/Claude) or 80 seconds (Gemini). The patch honors adapter deadlines, bounded at 120 seconds. Tool execution still has its independent deadline and isolated working copy. Deadline expiry does not establish that remote inference was cancelled.

## Changes

- A shared step-limit calculation (default eight, maximum twelve) sets the per-adapter turn cap to steps + six, at most eighteen calls. The extra allowance covers routing, requirements, one repair and post-tool synthesis. Existing output-token limits remain; this is a request ceiling, not a measured dollar-cost guarantee.
- Typed request-budget exhaustion remains terminal and never triggers backup fallback. A configured backup after other eligible failures has its own bounded allowance; aggregate fallback cost is not falsely represented as one adapter's ceiling.
- Safe diagnostics distinguish request-budget failure; existing HTTP/schema/timeout categorization remains. No upstream body is added to trace.
- Agent usage counts actual adapter requests, not merely attempted decisions.
- Saved agent output is surfaced in the assistant response; technical warnings remain in run activity. Partial work receives recovery wording and is not marked completed.

## Verification

`tests/unit/model-budget.test.ts` exercises Grok, Claude and Gemini through their actual transports with mocked responses: fourteen successful requests, then rejection without further network I/O. Tests cover configuration clamp and no backup after exhaustion.

`tests/unit/unified-agent.test.ts` checks persisted partial status and safe trace on budget exhaustion. Existing acceptance/agent/provider tests pass in targeted runs. These are deterministic regression tests, not live provider verification.

## SDK evaluation

Inspected installed Apache-2.0 `ai@7.0.155`, `src/agent/tool-loop-agent.ts`, stop conditions and test model API. `tests/unit/tool-loop-spike.test.ts` runs the real document schema/executor through ToolLoopAgent and reloads its SQLite checkpoint. It passes. This is an isolated mocked transport spike, not a completed live Qloo/research/document comparison. No new orchestration runtime was added. Keep the current guarded loop until live comparative recovery/cost testing supports migration.

## Remaining blockers

This executor has no bound XAI_API_KEY, GROK_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY or QLOO_API_KEY (presence checked only). Live flagship and same-pool cultural evaluation remain unverified.

The GitHub connector cannot retrieve binary fixtures: contents returns empty data for the 1.3 MB archive, and blob fetch rejects non-UTF-8. Original archives are retained in the git tree and must not be replaced. The prior private Actions checkout verified their hashes and passed unit tests.

Prior exact-base CI: https://github.com/Davemafy/qloo-test/actions/runs/40756819924 . Formatting failed in three files (now formatted). Four browser failures remain: continuity cultural outcome/export/review/revocation; HTTP ownership/bounds/memory/shares; local account registration/logout/login; broader-outcomes listening programme/editable source. Their assertion causes are not established by the public redacted log. Do not relabel them selector failures or claim they are fixed.

## Confirmed Gemini protocol regression

The Gemini adapter's local `Function` schema omitted `interpret_agent_requirements`. Every requirements call through that adapter failed local schema parsing before provider I/O. Added the missing allowed name and a regression using the actual Gemini transport (`model-budget.test.ts`). This is a confirmed local cause, independent of credentials and the request-budget mismatch.

## Archived browser diagnosis from exact-SHA CI

At `966c78825ee6302be807335c95fae140734d0f62`, https://github.com/Davemafy/qloo-test/actions/runs/40771953831 passed install, original archive integrity, formatting, typecheck, lint, units, evaluation harness and build. Browser assertions: three at `vision.e2e.ts:42` (the shared gathering-ready precondition), one at `broader.e2e.ts:97` (owner-supplied document edit did not persist).

The shared helper assumed profiles on a new personal task. It now explicitly invokes the existing sample action before its recorded gathering turns, preserving fresh-user privacy. All downstream ownership/export/account assertions remain unchanged. The real edit regression was the grounding guard rejecting `Edit main:` even though the DevelopmentModel correctly parsed that explicit legacy artifact command. The guard now recognizes the anchored, explicit `main`/`invitation` form; supplied-content checks remain. A new workflow regression verifies exact text, SQLite reload and budget retention (36 workflow tests pass locally).

The Actions presence-only check confirms existing Qloo and Gemini secret bindings, with no Grok/Claude binding in that repository. Binding presence is not proof of provider authorization; live verification must establish actual access. No credentials were changed or printed.
