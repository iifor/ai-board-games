# Task 2 report — execute-gated production cutover orchestration

## Outcome

Implemented one production-only `cutover` command in `packages/db-migrator`. The command verifies only the consistent backup snapshot and manifest, defaults to a zero-write dry-run, requires an exact bounded v1 authorization for execute, validates the fixed production environment before reservation, reserves immutable evidence, holds one global session advisory lock through final report publication, runs the compiled canonical migration adapter, transactional import, CA-backed validation, and production-purpose compiled application smoke, then publishes a non-overwriting redacted closure.

No Task 1 Compose, entrypoint, Dockerfile, role/bootstrap, secret, or canonical migration SQL file was changed. The existing single server ops adapter build was extended only through `packages/server/tsconfig.rehearsal.json`. No frontend, public API, shared business type, live SQLite, production service, nginx, real approval, or Task 11 artifact was accessed or changed.

## Structure and responsibilities

- `packages/db-migrator/src/cutover/types.ts`: fixed production identity, authorization contracts, and internal cutover options.
- `packages/db-migrator/src/cutover/authorization.ts`: maximum-1-MiB stable authorization load and exact fail-closed validation.
- `packages/db-migrator/src/cutover/evidence.ts`: verified source/manifest boundary and exclusive immutable evidence reservation.
- `packages/db-migrator/src/cutover/targetSession.ts`: explicit CA-backed `pg.Client`, fixed URL/TLS checks, global advisory lock, and read-only target gate.
- `packages/db-migrator/src/cutover/reporting.ts`: fixed redacted failures, report construction, artifact references, and migration-report publication.
- `packages/db-migrator/src/commands/cutover.ts`: phase orchestration only; split below the repository backend file-size guideline.
- `packages/db-migrator/src/postgres/cutoverSchema.ts`: bounded stdin/stdout bridge to the compiled server migration adapter; URL is never argv.
- `packages/server/db/postgres/cutoverAdapter.ts`: independent fixed-target/schema/TLS enforcement, `CREATE SCHEMA consensus`, and canonical `migratePostgres` invocation.
- Existing validation and smoke boundaries gained explicit production TLS / internal production-cutover purpose wiring without changing business semantics.

## TDD evidence

Each group was run RED before implementation and GREEN after the narrow implementation:

1. Authorization RED: module missing. GREEN: exact shape, extra fields, placeholders, duplicate identities, future approvals, window/run/candidate/hash/target mismatch, all-zero and malformed/bounds cases.
2. CLI RED: unknown/unimplemented command and incorrect failure code. GREEN: literal target and fixed identity options reject before I/O; missing auth fails closed; dry-run writes nothing; built-in and compiled-dist dry-run succeed without server TypeScript.
3. Evidence RED: module missing. GREEN: source/manifest verification, immutable owner/auth/manifest copies, unsafe run ID, tamper, existing report, repeated/concurrent reservation, and non-overwrite behavior.
4. Release closure RED: a valid production closure failed. GREEN: exactly 16 final gates with `production.cutover`, exactly three smokes, unique same-run/schema validation and smoke, exact cutover artifacts, and provenance hash/target checks; absent/duplicate/failed/mismatched closures fail.
5. Target session RED: module missing. GREEN: explicit CA/TLS, PostgreSQL 16, database/role/privilege/SSL/schema/table gate, same-client lock/unlock, global serialization independent of run ID/output, and fixed failures.
6. Compiled migration adapter RED: module missing. GREEN: exact `consensus` creation, canonical migrations, independent target/TLS/schema gate, stdin-only target, and primary-error preservation.
7. Full orchestration RED: module missing. GREEN: zero-write dry-run, environment rejection before reservation, one held session through all phases and final report, import/validation/smoke sequencing, validation suppression of smoke, smoke failure evidence, fixed provenance checks, and close errors not replacing a recorded primary failure.
8. Production smoke gate RED: compiled smoke rejected `consensus`. GREEN: production is accepted only with internal `production-cutover` purpose, exact fixed migrator identity/schema/verify-full URL, and inherited verify-full/CA environment; ordinary smoke remains limited to `_test`/`_rehearsal` databases.
9. Bounded authorization self-review: the original size rejection happened after a full stable read. The stable content helper now accepts an optional pre-read metadata limit; authorization passes 1 MiB so oversized input is rejected before content allocation/read.

## Verification

Fresh final results:

- Task 2 migration focused: 30 tests, 30 passed, 0 failed.
- Complete migration suite: 122 tests, 122 passed, 0 failed.
- Task 2 PostgreSQL focused: 15 tests, 15 passed, 0 failed.
- Complete PostgreSQL suite against the dedicated local PostgreSQL 16 test container: 124 tests, 124 passed, 0 failed (117 top-level subtests plus one 8-case suite). Test credentials existed only in the test subprocess environment and were neither echoed nor persisted.
- Complete unit suite: 365 tests, 365 passed, 0 failed (358 top-level subtests plus one nested suite).
- Workspace `pnpm run check`: all 5 checked packages passed.
- Workspace `pnpm run build`: server and the single compiled ops adapter build, shared, client, and admin passed. The existing admin bundle-size warning remains non-failing and unrelated.
- Dedicated db-migrator build and server build/check passed.
- Compiled `packages/db-migrator/dist/cli.js cutover` dry-run passed, produced no output directory, and did not load server TypeScript.
- `git diff --check`: passed.

## Self-review

- Secrets and endpoints: target URL is environment/stdin only; no password/URL/endpoint is stored in reports or emitted by fixed errors. Final target assertion contains database/schema/role/TLS only.
- Mutation boundary: dry-run has zero database calls and filesystem writes. Missing/invalid authorization and invalid target environment fail before reservation/database access. Execute never copies the SQLite snapshot, retries, drops, truncates, deletes evidence, starts app/nginx for traffic, or grants final approval.
- Lock lifetime: the advisory-lock client remains open through schema creation, import, validation, smoke, and final report publication. Different run IDs and output directories share the same lock namespace.
- Failure preservation: owner/evidence/schema and every already-published phase report remain. Validation suppresses smoke. Close failure does not replace an already-recorded phase failure.
- Release gate: still exactly 16 checks. `docs.runtime-truth` was replaced by `production.cutover`; documentation truth remains in signed CI/environment evidence.
- Documentation: only `docs/project-server.md` and `docs/postgresql-deployment.md` were updated, as assigned. Task 3 retains ownership of the full Linux operator runbook.

## Concerns

None blocking. The dedicated test container's configured password differed from the initially supplied test value; final PostgreSQL verification used that container's existing configuration only in-memory and passed completely. No repository or container credential was changed.

## Fix Round 1 (2026-08-12)

### Outcome

Verified every independent-review finding and closed all eleven without widening the production authorization boundary. The production URL is now queryless and validated only for protocol/host/port/database/user; TLS is exclusively inherited from `DATABASE_SSL=verify-full` and a readable CA and is passed as `ssl: { ca, rejectUnauthorized: true }`. Pre-cutover authorization still cannot authorize traffic, app, or nginx startup.

Production smoke now owns uniquely run-scoped synthetic players, memories, game state, and observability rows. It removes all of them in `finally` after success and failure and never selects, updates, or deletes pre-existing players or memories. A real PostgreSQL test seeds pre-existing player/memory bytes and proves they remain unchanged. The implementation also accounts for the actual observability model: `game_traces` has no `game_id`, so run-owned traces are resolved through the root span's `game.id` attribute before cleanup.

Release readiness now accepts only the exact formal-validation intentional skipped-table checks and still rejects unknown or required skips. It cryptographically binds the exact authorization, manifest, owner receipt, completion receipt, migration evidence, validation report, and smoke report to the cutover report's same run, candidate, source, target, schema, paths, and hashes. Independently re-signed swaps or mixed closures for each artifact type fail closed; the final signed gate count remains exactly 16.

A passed report references an immutable completion payload/hash prepared while the advisory lock is held. The completion receipt is published only after unlock and connection close both succeed. Close or receipt-publication failure leaves no valid completion file, uses a fixed CLI failure, and cannot pass release readiness; failed phase reports never receive completion.

The importer now consumes the already-open readonly/query-only SQLite handle owned by cutover. Stable capture, open, filesystem identity and SHA-256 recheck, a held SQLite read transaction, import, validation, and before/after recaptures all bind the same snapshot. Path swaps, inode replacement where the platform permits it, and content/metadata mutation before or during import/validation are detected before a successful closure. Durable migration evidence stores `[verified-consistent-snapshot]`, never an absolute source path.

All cutover evidence/report filesystem failures are mapped to fixed path-free codes: `CUTOVER_SOURCE_INVALID`, `CUTOVER_EVIDENCE_PUBLICATION_FAILED`, `CUTOVER_VALIDATION_IO_FAILED`, `CUTOVER_MIGRATION_EVIDENCE_FAILED`, `CUTOVER_REPORT_PUBLICATION_FAILED`, and `CUTOVER_COMPLETION_PUBLICATION_FAILED`. Adversarial raw errors do not expose absolute paths, database URLs, endpoints, passwords, or errno text. Authorization timestamps must equal canonical `toISOString()` values and are revalidated after source verification immediately before reservation and again immediately before schema mutation.

The CLI dispatcher and orchestration were extracted into focused modules. `cli.ts` is 244 lines, `commands/cutover.ts` is 123 lines, and `cutover/orchestrator.ts` is 187 lines. The pre-existing oversized `backup/fileSnapshot.ts`, `commands/validate.ts`, and `postgres/validationExecutor.ts` are byte-equivalent to the pre-Task-2 baseline; new bounded/TLS behavior lives in focused modules. No touched Task-2 backend module exceeds 250 lines.

### Task 1 overlap

One concrete, minimal Dockerfile overlap was required. The compiled production integration proved that the ops image contained the server adapter but not its production dependencies. The builder now deploys the server production dependency closure to `/opt/server-ops`, and the ops stage copies only that `node_modules` tree to `packages/server/node_modules`. Compose, entrypoints, role/bootstrap scripts, secrets, and canonical SQL were not modified. Both the application and migrator production images remain TypeScript-free and isolated.

### Strict RED to GREEN evidence

1. Queryless URL/environment TLS: focused RED was 4 passed / 11 failed; GREEN was 15/15.
2. Smoke ownership and cleanup: real PostgreSQL RED was 124/126; success/failure cleanup plus byte-preservation GREEN was 3/3.
3. Intentional validation skips: a valid 16-gate closure with formal skipped-table checks failed before the change; focused release GREEN was 31/31, with unknown skips still rejected.
4. Cryptographic closure: valid closure RED was 0/1; GREEN was 1/1, followed by a seven-artifact independently re-signed swap/mix test at 1/1.
5. Completion receipt: close/publication cases RED were 16/19; GREEN was 19/19.
6. Path/error redaction: migration evidence first exposed the absolute source path; focused GREEN stores only the fixed marker and all injected filesystem errors are fixed/path-free.
7. Authorization timing: focused RED was 15/17; GREEN was 17/17.
8. Source identity: the focused test first failed because the handle-binding module was absent; handle/path-swap GREEN was 1/1 and validation-time mutation GREEN was 1/1.
9. Real PostgreSQL 16/TLS: the first integration run found the missing ops dependency closure and missing schema in formal validation evidence. After the two narrow fixes, the compiled production execute test was 1/1 GREEN.
10. Credential literals: the new repository guard produced 128/129 with the two cutover test offenders; runtime-generated opaque credentials/URLs produced 129/129 GREEN.
11. Size boundary: the dispatcher test first measured `cli.ts` at 287 lines; GREEN is 244/123/187 for CLI/command/orchestrator, with the three pre-existing oversized files restored.

### Real PostgreSQL 16/TLS coverage

The unique production-style Compose fixture builds compiled app/migrator images, generates a one-run CA and `DNS:postgres` leaf certificate, and uses random credentials only in subprocess memory. It proves global advisory-lock contention across two clients with different run IDs; canonical `consensus` schema creation through the compiled server adapter; injected invalid import rollback leaving `consensus.skins` and `consensus.model_providers` at `0|0`; successful compiled execute against a fresh target; same-schema formal validation and production-purpose smoke; complete successful smoke cleanup with synthetic players/memories/games/admin users at zero; the schema-present unsafe-target gate; and TypeScript-free ops/server dist. Cleanup removes only the unique test project, volumes, images, and temporary directory.

### Fresh verification

- Complete migration suite after the final credential-literal guard: 129 tests, 129 passed, 0 failed, 0 skipped.
- Complete PostgreSQL suite: 124 top-level subtests / 131 tests, 131 passed, 0 failed, 0 skipped; the final compiled real PostgreSQL 16/TLS execute case passed in 54.3 seconds.
- Complete unit suite: 358 top-level subtests / 365 tests, 365 passed, 0 failed, 0 skipped.
- Complete workflow suite: 127 tests, 127 passed, 0 failed, 0 skipped.
- Dedicated production Compose TLS runtime/ops probe: 1 test, 1 passed, 0 failed, 0 skipped. It proved TLS-only/SCRAM, fixed roles, default grants, app DML without DDL, migrator DDL, credential non-disclosure, and image isolation.
- Workspace `check`: all 5 checked packages passed.
- Workspace production `build`: server compiled ops adapters, shared, client, and admin passed. The existing non-failing admin chunk-size warning remains unrelated.
- `git diff --check`, backend size guard, pre-Task-2 baseline restoration check, cutover credential-URL scan, and fixed source-marker scan passed.

### Files and boundaries

New focused production modules are `cli/cutoverDispatch.ts`, `cutover/boundedFile.ts`, `cutover/completion.ts`, `cutover/orchestrator.ts`, `cutover/sourceIdentity.ts`, `cutover/validation.ts`, `postgres/cutoverValidationExecutor.ts`, `release/cutoverVerification.ts`, and `server/smoke/applicationSmokeOwnership.ts`. New tests are the cutover source-identity, application-smoke runner, production integration, and shared cutover test-helper files. Existing Task-2 cutover, release, reporting, importer, server adapter/smoke, runner, and focused test files were modified. Only `docs/project-server.md` and `docs/postgresql-deployment.md` were changed under `docs/`. No file was deleted; no public API, shared business type, canonical SQL, Compose, entrypoint, live SQLite, production service, nginx, real approval, or Task 11 artifact changed.

### Self-review and concerns

The production smoke purpose is not exposed as a separate public CLI. Target reports remain endpoint-free. Execute with missing or invalid authorization remains a failed no-write dry-run, ordinary dry-run writes nothing, the advisory session stays open across all mutating phases, pre-cutover authorization never authorizes traffic, and the final gate remains exactly 16. No blocking concern remains. The local shared test container's password differed from the initially supplied value; the full PG suite read that existing container configuration only into the test subprocess environment, did not echo or persist it, and passed without changing the container or repository credential.
