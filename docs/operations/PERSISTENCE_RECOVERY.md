# SQLite backup and recovery

Igor uses one application instance and four SQLite stores. A working volume mount
and scheduled backup on Railway are **not verified by local tests**. This utility
provides a repeatable offline recovery procedure without changing deployment or
credentials.

| Store                                     | Existing environment override | Default under the application directory |
| ----------------------------------------- | ----------------------------- | --------------------------------------- |
| Tasks, accepted turns, memory and journal | `IGOR_DB_PATH`                | `.igor/workspace.sqlite`                |
| Accounts and sessions                     | `IGOR_AUTH_PATH`              | `.igor/auth.sqlite`                     |
| Collections, shares and outcomes          | `IGOR_OUTCOMES_PATH`          | `.igor/outcomes.sqlite`                 |
| Provider cache                            | `IGOR_CACHE_PATH`             | `.igor/qloo-cache.sqlite`               |

## Take a coordinated snapshot

Use Node 24. Stop application writes across all four stores first. The
`--quiesced` flag acknowledges this operator prerequisite; it does not stop a
server. Independent snapshots of actively changing databases do not establish a
coordinated recovery point.

Run from the existing application directory with the existing path overrides:

```bash
node scripts/persistence-snapshot.mjs backup --output /private/igor-backup-NEW --quiesced
node scripts/persistence-snapshot.mjs verify --input /private/igor-backup-NEW
```

The parent directory must already exist; the output directory must be new. All
four source files must exist at distinct paths. The utility opens sources
read-only, uses SQLite's backup API to include committed WAL pages, checks each
database and writes SHA-256 checksums in a manifest. Backup directories use mode
0700 and database files use mode 0600. Hashing streams database bytes. Missing,
corrupt or incomplete inputs fail rather than creating empty databases.

Snapshots contain private accounts, sessions, conversations and work. Keep them
outside source control and CI artifacts. Do not upload them to public qloo-test.

## Rehearse a restore before changing production

```bash
node scripts/persistence-snapshot.mjs restore --input /private/igor-backup-NEW --output /private/igor-restored-NEW --quiesced
```

Restore verifies checksums and SQLite integrity, writes into a new directory and
never replaces existing files. A rejected restore must not emit a completion
receipt. Inspect the recovered state using the normal store APIs in an isolated
application instance before selecting restored paths. Restored authentication
state is the state at the snapshot time, including session validity; reconcile
subsequent revocations before reopening access.

Only an owner-authorized deployment should change the production path overrides
or switch a Railway service to restored state. No deployment or secret changes
are part of this utility.

## Verification boundary

`tests/unit/persistence-snapshot.test.ts` restores actual store databases containing
synthetic accounts, confirmed memory, approved owner wording, an accepted message
and execution lease journal, a saved collection and a cached protocol fixture.
Source connections remain open to exercise committed WAL data. The tests also
reject missing stores, tampered snapshots, output replacement and a false CLI
success receipt.

Before release, independently confirm the Railway volume is persistent, all four
overrides point inside that volume, only one app instance writes these files,
backups run successfully, and a real deployment restore rehearsal succeeds. No
Railway account/session is connected in this engineering environment; these
hosting checks remain blocked, not passed.
