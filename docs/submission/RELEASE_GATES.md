# Igor release gates — PR #21

**Policy:** draft only until explicit owner approval. No merge, deploy, change of repository visibility, credential operation or Devpost submission.

## Inspected state before judge-first changes

- Inspected PR head: 4cc5fa3a126cbb6d4bee7c3dbf91631119ad9e70. Subsequent implementation commits followed; re-read the current head before reporting final SHA.
- Prior local report: 424 unit passes, one fixture-integrity assertion failed, five suites could not load the original archive; browser 16 pass/10 archive-blocked fail; fluid/continuity Chromium 3 pass. **These are not test results for the new changes.**
- GitHub Actions Verify and Mobile Gate failed within seconds with **zero executable steps and missing logs**. Fresh PR commits reproduced failing Actions. Exact cause is not confirmed; owner must inspect Actions runner provisioning, repository/account policy or billing information in the GitHub UI.
- Live Qloo/provider flagship: **not executed or demonstrated** in this runtime. Earlier browser media uses labeled SAMPLE data and cannot prove live cultural output.

## Exact-SHA protocol

On an authorized checkout of the actual PR head, record git rev-parse HEAD. Recover/verify original tests/fixtures/qloo-cultural.json.gz from the committed source, without substituting synthetic archives or skipping failing tests.

    npm ci
    npx playwright install --with-deps chromium
    npm run format:check
    npm run typecheck
    npm run lint
    npm test
    npm run test:eval
    npm run build
    npm run test:browser
    npx playwright test --config tests/integrated.playwright.config.mts

Log each exit code, tested SHA, counts, duration, screenshots and traces. Do not report green if the runner never executed checkout or only a partial suite ran.

## Authenticated live acceptance

Use a private runtime on the same SHA, configured with approved model/Qloo provider secrets using server-side secret injection. Start on port 3570 and run:

    IGOR_BASE_URL=http://127.0.0.1:3570 node scripts/verify-live-flagship.mjs
    IGOR_BASE_URL=http://127.0.0.1:3570 \
      IGOR_UNSCRIPTED_PROMPT='<owner-authored independent goal>' \
      node scripts/verify-live-alternatives.mjs

The flagship verifier now demands LIVE cultural evidence both before and after the selective revision; CACHED alone cannot produce a passing live result. Review the saved outputs manually for actual utility, cultural provenance, correct Bad Bunny correction, $3,000 budget, independent approval, reload identity and disclosed unknowns.

The ordinary/alternative harness checks a real response and persisted continuation, **not** semantic quality. Review any shallow alternative manually. Same-pool Qloo/no-Qloo evaluation remains a separate experimental gate. Never invent lift or rankings.

## Public readiness

- Audit LICENSE, dependency licenses and image provenance. Preserve photo-source URLs and use rights; do not treat search availability as reuse permission.
- Scan complete release tree, git history and built artifacts for credentials, .env, private URLs, access tokens and unintended fixture release. Prior source scan was limited.
- Verify independent visitor task isolation, concurrent requests, share revocation, API bounds and safe reviewer rate/cost ceilings.
- Hosted judges must not have to supply keys; report graceful provider failure and distinguish LIVE vs CACHED accurately.
- Only **after owner approval to deploy**, verify public page, clean-browser access, /api/health revision SHA, live calls and rollback.

## Current decision

**NO-GO.** Require passing exact-SHA execution, authenticated flagship, independent ordinary/unscripted goal, source/license audit, actual product media, safe hosted experience and explicit owner approval. Prior mock checks or artistic footage cannot substitute.
