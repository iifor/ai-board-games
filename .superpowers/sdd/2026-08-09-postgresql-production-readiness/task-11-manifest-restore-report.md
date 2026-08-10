# Task 11 follow-up: Windows long-path backup verification and restore drill

Date: 2026-08-10
Result: PASS
Base commit: `d558ab7`

## Root cause

The published backup was valid and Node had already captured a resource whose absolute path exceeded 296 characters. The readiness runbook then attempted to re-enumerate, hash, resolve, and restore that evidence through PowerShell `Get-ChildItem`, `Resolve-Path`, `Get-FileHash`, and `Copy-Item`. On Windows that second implementation failed on the long resource path, so the backup could not be independently verified or restored even though publication succeeded.

## Outcome

- `verify-backup` is a formal read-only db-migrator command. It validates the manifest identity and shape, exact case-insensitive file set, sizes, SHA-256 values, top-level SQLite hashes, filesystem identities, and pre/post evidence stability. It rejects symlinks/reparse points, path escape, duplicate/case-aliased paths, missing/extra files, and TOCTOU changes with fixed path-free errors.
- `restore-drill` performs a non-mutating dry-run unless `--execute` is explicit. Execute claims a nonexistent or empty isolated target with an exclusive owner token, maps every resource source index to a distinct relative destination, copies through held Node handles into exclusive files, and verifies the exact restored file set, sizes, and hashes. Failure preserves the isolated scene and owner token; success removes the token before final exact-set verification.
- Ordinary backup and resource files are hashed and copied in 256 KiB chunks. Only the small manifest and resource-map JSON files use stable whole-file reads. A 32 MiB controlled-file test forbids `FileHandle.readFile` on the normal evidence path.
- The raw SQLite main/WAL/SHM rollback set is opened in place read-only and query-only, then checked independently from the consistent copy. Both require `integrity_check=ok`, required tables, and matching key-table counts.
- `verify-backup.ps1` and `restore-drill.ps1` are thin `$PSScriptRoot` plus `pnpm.cmd` forwarders. They contain no SQL, database URL, hash, or copy implementation.
- The production-readiness runbook now invokes those commands and no longer embeds a second PowerShell hashing/copying/SQLite implementation.

## TDD evidence

- Initial RED: migration suite stopped because `commands/verify-backup` did not exist.
- Wrapper RED: 1/3 focused operations-script tests passed before the two wrappers were added; GREEN was 3/3.
- Security/built RED: 94/96 passed. The two failures exposed an unreliable Windows process-spawn harness and an unsafe manifest run id; both were corrected.
- Resource-map RED: 95/96 passed because malformed JSON failed before the command could emit atomic sanitized failure evidence; stable map loading moved inside the command boundary.
- Ownership/exact-set RED: 96/98 passed. Failure scenes lacked an owner token and no exact destination-set API existed; both boundaries were implemented.
- Final migration/backup result: 98/98 passed, 0 failed, 0 skipped. This includes a real 296+ character fixture where the old PowerShell hash flow fails and the built Node CLI verifies and restores successfully.

## Verification

| Gate | Result |
| --- | --- |
| `pnpm.cmd run test:migration` | PASS, 98/98 |
| `pnpm.cmd run test:unit` | PASS, 348/348 |
| `pnpm.cmd run test:postgres` with the authorized local test environment | PASS, 107/107 |
| `pnpm.cmd run check` | PASS, all five checked workspace packages |
| db-migrator plus server/shared/client/admin builds | PASS |
| PowerShell AST parse | PASS, 7 scripts and 13 readiness-runbook blocks |
| Wrapper/runtime static scan | PASS; no URL/SQL/hash/copy logic in wrappers and no server `better-sqlite3` dependency |
| `git diff --check` | PASS |

## Scope

- No frontend, HTTP API, PostgreSQL schema, shared API type, production server SQLite dependency, or production database connection changed.
- No Task 11 backup artifact, source SQLite/WAL/SHM, resource source root, or rehearsal schema was read or modified by these tests.
- `better-sqlite3` remains confined to the standalone db-migrator workspace.
- Formal restore output remains a direct isolated child of its evidence root and cannot equal the backup root or known repository/data/resource roots.

## Residual operational boundary

The filesystem identity and exclusive-file checks prevent accidental overwrite and fail closed on observed replacement. As with the existing Task 4 backup boundary, host-account isolation is still required against a same-account actor racing individual filesystem syscalls.
