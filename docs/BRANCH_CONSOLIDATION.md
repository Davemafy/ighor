# Igor branch consolidation ledger

**Decision 2026-10-29:** Igor has one active development branch, `feat/partiful-codrops-unified-20261029`, plus `main`. No other branch may receive new work. The only active review PR is [#27](https://github.com/Davemafy/igor/pull/27), directly against `main`. Nothing in this cleanup is a release authorization.

## Already in active branch by ancestry

| Archived work | Frozen head | Relationship |
|---|---|---|
| [#19 general agent runtime](https://github.com/Davemafy/igor/pull/19) | `c6af78d5b1136a8f3106b5d4d1cf6fdffcc3b7bc` | Ancestor of active head |
| [#21 one-chat/evidence integration](https://github.com/Davemafy/igor/pull/21) | `8d899c57f6c3176254acfdd32a298b500d54d6a6` | Ancestor of active head |
| [#26 licensed Codrops gallery](https://github.com/Davemafy/igor/pull/26) | `762b70d69b343f60eb37b13ad8f2055fe79e1762` | Ancestor of active head |
| [#25 Partiful-native invitation](https://github.com/Davemafy/igor/pull/25) | `e5fabbb47b6a1647bc1a6e9cb0151135be16e88b` | Invitation source and tests selectively ported (not an ancestor); verify any unported changes before deleting source |

## Not yet completely reconciled: DO NOT CLAIM INTEGRATED

The branches below contain commits not in the active branch. Their PRs may be administratively archived to end parallel development, but their frozen commit identifiers **must be preserved** for selective porting. In particular, do not overwrite newer integrated orchestration with an older conflicting branch.

| Archived PR | Source head SHA | Required assessment on the one active branch |
|---|---|---|
| [#16 conversational reliability and live research agent](https://github.com/Davemafy/igor/pull/16) | `7459bd6b007164e8e5d669dbb343ef7c88b1c73c` | Audit model-directed read/search loop and recoverable first turns versus current runtime; substantial divergent history |
| [#17 50k conversation evaluation](https://github.com/Davemafy/igor/pull/17) | `15cd22162888b898f991f84c64d9f7729a5285e6` | Port or regenerate relevant deterministic eval harness without the older engine fork |
| [#18 Qloo cultural workspace](https://github.com/Davemafy/igor/pull/18) | `ced0b1558d86f0194e95ad115432231268fa7537` | Check unique source/test commits; parent baseline overlaps heavily with active head |
| [#20 grounded discovery details](https://github.com/Davemafy/igor/pull/20) | `d1c9d9d98e47ed34ba989a0311d5bacfc2a8f063` | Review unique shared-object UI code against updated Partiful-native surface |
| [#22 outcome acceptance hardening](https://github.com/Davemafy/igor/pull/22) | `88f72d65269d2118be7990d548e0819600ab56a8` | Review acceptance semantics, selective revision tests and protected artifacts |
| [#24 Codrops original reference harvest](https://github.com/Davemafy/igor/pull/24) | `9ec658077eaf2203dd9afc6045119028af502872` | Existing MIT adapter is active; preserve any separately useful original source notes, license details |
 
## Previous rejected experiment

[#23 Taste Lens](https://github.com/Davemafy/igor/pull/23) was already closed unmerged and is **not** a visual direction to port. Do not resurrect the faux-instrument dashboard.

## Execution rules

1. New work goes directly to the active branch; PR #27 always targets `main`. Avoid stacked PRs.
2. An old PR is a frozen reference, **not** an active workstream. Review any unique changes only when they matter; cherry-pick, reimplement or abandon them in the current architecture deliberately, without silently discarding features.
3. Before physical branch deletion, confirm exact old commit SHAs are retained in GitHub's closed PR history or an immutable archive and the unique commits are accounted for. Closing a PR does **not** delete a Git branch.
4. Do not automatically bulk-merge diverged histories or delete branches just to make branch counts look smaller.
5. Run the exact-head checks on the active branch after any feature integration; inherited prior CI checks do not prove new changes.
6. Explicit approval is still required before merging to `main` or deploying.

**Physical cleanup status:** GitHub's connected write actions can close PRs, but they do not expose branch deletion. Legacy branch refs require a separate authorized git/GitHub deletion workflow after content reconciliation. Never report them as deleted before that operation succeeds.
