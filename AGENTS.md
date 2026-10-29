# Igor agent instructions — one development branch

## Branch policy (user directive, 2026-10-29)

- `main` is the protected logical release line. **Do not edit, merge into or deploy from main without explicit user approval.**
- The **only active development branch** is `feat/partiful-codrops-unified-20261029`. Implement all future frontend, backend, Qloo, design, testing, and launch-footage source work directly on this same branch.
- **Do not create feature, integration, experiment, research, hotfix, worktree-sync, or release branches.** Do not open another PR to stage the same feature. Update the existing draft PR [#27](https://github.com/Davemafy/igor/pull/27) if an artifact of review is needed.
- If an automation or agent cannot edit the existing branch, report the blocker; do **not** create a workaround branch.
- Old branches and closed PRs are archived sources only; do not continue working on them. The unresolved source commits are indexed in [docs/BRANCH_CONSOLIDATION.md](docs/BRANCH_CONSOLIDATION.md).
- Never rewrite history, force-push or delete old refs before confirming any unique work is intentionally retained or ported. Do not silently drop the unported agent/research/evaluation improvements.
- Build and test at the exact active branch SHA. A green build on a different branch does not verify this branch.
- Only mark PR #27 ready and consider merging when the full integrated application is verified (normal conversation, Qloo provenance, persistent memory, editable artifacts, Partiful-aligned UI, desktop/mobile, and CI).

## Visual constraints

- [docs/design-system.md](docs/design-system.md) is the binding public-source-derived Igor design contract: Partiful-inspired composition with quiet app chrome and expressive authored results.
- No unrelated black dashboards, fabricated intelligence metrics, default AI marketing widgets, or duplicate product shells.
- Reuse verified MIT Codrops image-layout mechanics only where useful. Preserve provenance and licenses.
- Real UI interactions and provider-backed evidence come before demo-video footage.

## Task discipline

1. Inspect the current active branch before editing.
2. Reuse current app components and tests; check the consolidation document for old work.
3. Make the smallest coherent change **on the same branch**.
4. Verify typecheck, lint, build, unit and browser acceptance; state what is not verified.
5. Update PR #27, not a new PR. Do not merge or deploy unless instructed.
