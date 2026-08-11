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
