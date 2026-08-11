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

## Fix Round 2 (2026-08-12)

### Verified findings and fixes

1. Formal validation previously reopened `sourceSnapshotPath` through the ordinary validation command even though import used the held verified SQLite handle. `CutoverValidationOptions` now carries that exact handle. The cutover wrapper injects a non-owning facade through the validation dependency boundary: every database method is bound to the held readonly/query-only handle, while facade `close()` is deliberately a no-op. Therefore the ordinary path-opening constructor is never used for production cutover validation, validation cannot close the borrowed handle, and the orchestrator remains the sole owner. No database copy or path alias was introduced.
2. Production smoke ownership now exists before configuration CRUD. It includes the exact run-owned skin name and records the returned skin ID immediately after a successful POST, before any injected or real PUT/DELETE failure can occur. `finally` removes skin rows by ID and name together with every synthetic player, memory, game, workflow, observability, and admin row, then verifies no owned row remains. Real PostgreSQL tests preserve a pre-existing skin, two players, and their memory byte-for-byte across both a complete successful smoke and an injected failure immediately after skin POST.
3. Resource closure now follows one strict order: all phases and final report publication, verified SQLite source close, advisory unlock plus PostgreSQL connection close, then completion receipt publication. A source-close failure is fixed as `CUTOVER_SOURCE_CLOSE_FAILED` / `Production cutover source failed to close`; raw paths, errno text, and URLs cannot escape. It still attempts PostgreSQL release, never publishes completion, and cannot produce a releasable closure. An already-recorded phase or report failure remains primary. The verified source close is idempotent and attempts both transaction rollback and database close before returning its fixed failure.

### RED to GREEN evidence

- Held validation: migration RED 129/130 failed because the wrapper did not inject a borrowed source; GREEN 130/130. The test attempts path swap and restore where the platform permits it, proves validation reads only the held verified bytes, proves facade close leaves the owner handle usable, and then proves the post-validation identity/hash check still passes for the restored original. Windows `EBUSY` is accepted only as proof that the held handle itself blocked replacement; the verified bytes are still read from that handle.
- Smoke skin cleanup: full PostgreSQL RED was 131/132 because the post-create injection hook was never reached. Focused real-PostgreSQL GREEN was 4/4, covering ordinary success, an observability/delete failure, and immediate failure after skin POST; all synthetic row categories were zero afterward.
- Closure order: focused RED was 1/3 passed and 2/3 failed because source close was absent from the observed order and its injected failure did not reject. After correcting the production order and making the failure double preserve the real close side effect, focused GREEN was 3/3. The tests prove `source-close -> release -> completion`, fixed redaction, receipt absence, and primary phase-failure preservation.

### Fresh verification

- Focused compiled PostgreSQL 16/TLS cutover execute: 1/1 passed; canonical migration, transactional import, held-handle formal validation, production smoke, target gates, and cleanup completed in 54.1 seconds.
- Final complete PostgreSQL suite: 127 top-level subtests / 134 tests; 134 passed, 0 failed, 0 skipped. The embedded compiled PostgreSQL 16/TLS case passed in 18.1 seconds and the suite completed in 57.2 seconds. An immediately preceding verification attempt used an invalid locally assembled port and failed only with `ECONNREFUSED`; it was corrected and is not counted as GREEN.
- Complete migration suite: 130/130 passed, 0 failed, 0 skipped.
- Complete unit suite: 358 top-level subtests / 365 tests; 365 passed, 0 failed, 0 skipped.
- Complete workflow suite: 127/127 passed, 0 failed, 0 skipped.
- Workspace type check: all 5 checked packages passed.
- Workspace production build: server/compiled ops adapters, shared, client, and admin passed. The existing unrelated admin chunk-size warning remains non-failing.

### Scope and self-review

Round 2 changes are limited to four db-migrator cutover files, three server smoke files, three focused test files, and this report. Every changed backend file is below 250 lines; `orchestrator.ts` is 197 lines and the largest changed server smoke file is 170 lines. No canonical SQL, public API, shared type, Compose/entrypoint, Task 3 runbook, live SQLite, production service, nginx, real approval, or Task 11 artifact changed. Formal validation contains no SQLite path open, borrowed ownership is explicit, completion remains absent after every source/session/receipt closure failure, and final release readiness remains exactly 16 gates.

## Fix Round 3 (2026-08-12)

### Verified finding and fix

The Round 2 smoke cleanup deleted the returned skin ID and then unconditionally deleted every skin with the run-owned name. A disposable real-PostgreSQL fixture proved that a pre-existing skin with the exact same name but a different ID was removed after an injected post-POST failure. Cleanup now captures the complete same-name ID set immediately before the create request. It deletes only a returned ID that is absent from that protected set and still has the exact run-owned name. If the POST succeeded but the response ID was never received, cleanup accepts only one unique set difference; zero means nothing remains, while multiple differences fail closed without deleting ambiguous rows. No name-only delete remains.

The scenario exposes bounded internal failure seams immediately after the POST response arrives, after its ID is recorded, after PUT succeeds, and around the real cleanup operation. They are not public CLI or API behavior. Tests use them only to interrupt the real HTTP/database path and still execute the production cleanup implementation.

### RED to GREEN evidence

- Same-name post-POST RED: focused real PostgreSQL was 3/4; the byte snapshot lost only the protected same-name skin. After ID-set ownership, the focused run was 4/4.
- Expanded matrix RED: 3/6 passed; PUT-after-success and cleanup-failure injections were not yet observed, while the compiled success case still used the stale adapter. The no-ID-window regression separately produced 3/7 passed before its hook existed.
- Expanded matrix GREEN after rebuilding the compiled server adapter: 7/7 passed. It covers compiled success, a later observability failure, failure after POST ID receipt, failure before POST ID receipt, failure after PUT, and a cleanup error reported after the real cleanup completed. Every applicable case preserves a pre-existing same-name skin, a pre-existing differently named skin, two players, and their memory byte-for-byte; every synthetic row count is zero.

### Fresh verification and scope

- Complete PostgreSQL suite: 130 top-level subtests / 137 tests; 137 passed, 0 failed, 0 skipped. The embedded compiled PostgreSQL 16/TLS execute passed in 53.8 seconds; the suite completed in 95.1 seconds.
- Complete migration suite: 130/130 passed, 0 failed, 0 skipped.
- Complete unit suite: 358 top-level subtests / 365 tests; 365 passed, 0 failed, 0 skipped.
- Complete workflow suite: 127/127 passed, 0 failed, 0 skipped.
- Workspace type check: all 5 checked packages passed.
- Workspace production build passed; the existing unrelated admin chunk-size warning remains non-failing.

Round 3 changes only the three server smoke ownership/HTTP/scenario modules, their real PostgreSQL application-smoke test, and this report. It adds no canonical SQL, public API, shared type, schema, Compose/entrypoint, release gate, Task 3 artifact, or production credential. All changed backend files remain below 250 lines.

## Fix Round 4 (2026-08-12)

### Verified finding and fix

Round 3 still inferred an unknown skin ID from the unique difference between the same-name ID sets captured before and after POST. Real PostgreSQL concurrency tests proved that this is not ownership: a failed/no-create POST followed by one independent same-name insert caused cleanup to delete the independent row, while deleting the smoke row and inserting a same-name replacement in the response window caused the same unsafe substitution. Keeping both the smoke and concurrent rows made cleanup fail as ambiguous and leave the synthetic smoke row behind.

Each application-smoke scenario now creates a separate `application-smoke-skin-<crypto.randomUUID()>` marker. The existing authenticated skin POST and PUT persist it unchanged through the existing `source` field; no API, schema, shared type, or canonical SQL changed. The marker is temporary, non-sensitive, absent from cutover reports, and verified as zero-residue after cleanup.

Cleanup still captures the same-name ID set before POST. With a returned ID, it deletes only that exact ID when the row also has the exact name and marker and was not in the pre-create set. Without a returned ID, it deletes only marker-bearing, same-name IDs absent from the pre-create set. It never deletes by name or by an unmarked unique ID difference. If the smoke row was externally removed, an independent same-name replacement is not a substitute. Final cleanup verification counts the exact per-run marker across all skin names and fails if any remains.

### Strict RED to GREEN evidence

- Case A, no smoke row/unknown ID plus one independent same-name insert: disposable PostgreSQL RED was 0/1. Existing cleanup deleted the independent row (`expected` one byte snapshot, `actual []`).
- Cases B and C: disposable PostgreSQL RED was 0/2. When smoke and independent rows both existed after a lost response ID, cleanup reported `APPLICATION_SMOKE_FIXTURE_CLEANUP_FAILED` and left the smoke row. When the smoke row disappeared before an independent same-name replacement entered, cleanup deleted the replacement (`expected` one byte snapshot, `actual []`).
- Marker GREEN: the three concurrency regressions passed 3/3. The complete focused application-smoke file then passed 10/10 after rebuilding the single compiled server operations adapter. The lost-ID case also queries PostgreSQL inside the response hook and proves the formal POST persisted exactly one RFC 4122 version-4 marker unchanged.
- The focused matrix covers compiled success, a later observability/delete failure, failure after POST ID receipt, failure before ID receipt, failure after PUT, cleanup reporting failure after real cleanup, and all three concurrency windows. Applicable cases preserve the pre-existing same-name skin, differently named skin, two players, memory, and independent concurrent rows byte-for-byte; all synthetic marker rows are zero afterward.

### Fresh verification

- Focused real PostgreSQL application smoke: 10/10 passed, 0 failed, 0 skipped.
- Complete PostgreSQL suite: 133 top-level subtests / 140 tests; 140 passed, 0 failed, 0 skipped. The compiled unique PostgreSQL 16 TLS production integration passed in 53.892 seconds; the suite completed in 96.227 seconds.
- Complete migration suite: 130/130 passed, 0 failed, 0 skipped.
- Complete unit suite: 358 top-level subtests / 365 tests; 365 passed, 0 failed, 0 skipped.
- Complete workflow suite: 127/127 passed, 0 failed, 0 skipped.
- Workspace TypeScript check: all 5 checked packages passed.
- Full production build passed for server and the single compiled operations adapter build, shared, client, and admin. The existing unrelated admin chunk-size warning remains non-failing.
- `git diff --check`, changed-path scope, backend line-count, no-name-only-delete, and added-secret/URL checks passed. Changed backend files are 140 and 139 lines; the inspected unchanged scenario is 173 lines.
- The disposable compiled cutover integration left zero matching containers, volumes, networks, or images.

### Scope and self-review

Round 4 changes only `applicationSmokeHttp.ts`, `applicationSmokeOwnership.ts`, `applicationSmoke.test.ts`, and this ignored report. `applicationSmokeScenario.ts` required no change and no helper file was added. There is no frontend, public API contract, shared type, database schema, canonical migration SQL, Compose/entrypoint, release gate, Task 3 artifact, live SQLite, production service, nginx, real approval, or production credential change. No file was deleted and no production cleanup scope was widened.
