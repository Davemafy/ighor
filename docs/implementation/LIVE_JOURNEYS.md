# Live browser acceptance journeys

Run the actual application with authorized Qloo and a healthy non-OpenAI model.
Keep `IGOR_TEST_FIXTURES` and `IGOR_QLOO_RECORDING` unset. Use isolated synthetic
workspaces; never use a real person's account or production database for these
rehearsals. No messages are sent to external people.

```bash
IGOR_VERIFY_BASE=http://127.0.0.1:3570 node scripts/verify-live-flagship.mjs
IGOR_VERIFY_BASE=http://127.0.0.1:3570 node scripts/verify-live-experiences.mjs
```

The first script checks the Brooklyn/Sade/Radiohead/Wong Kar-wai proposal, Bad
Bunny revision, approvals, reload and existing same-pool evaluation. The second
uses actual browser text entry and the durable journal for the consumer gathering
and listening-bar journeys. Set `IGOR_LIVE_JOURNEY=gathering` or `listening-bar` to
run only that journey while diagnosing a failure; `both` is the default.

Acceptance requires authentic current cultural evidence, linked typed decisions,
saved useful work, critique, confirmed budget, protected owner wording, changed
dependent decisions and persistence after reload. The gathering includes Maya's
music correction. The listening bar halves its budget and removes alcohol without
re-querying valid culture. Synthetic owner-authored access requirements are saved,
edited and approved through the authenticated work API, separately from model work.
These owner requirements are never presented as Qloo facts or model output.

Reports distinguish actual source deliveries and retain safe step summaries.
Desktop/mobile screenshots and uncut recordings show real application behavior.
An interrupted UI stream is recovered from its accepted turn journal, not by
resubmitting the user request. The scripts stop after a failed journey to avoid
buying another long test from an unavailable provider. A failure is not skipped or
relabeled successful.

Artifacts are written under `test-results/live-flagship` and
`test-results/live-experiences`. Source or database files must not be uploaded to
the public CI repository. A passing protocol-only model readiness check is not
application acceptance. These scripts are implemented acceptance gates; their
existence is not proof that either LIVE journey has passed.
