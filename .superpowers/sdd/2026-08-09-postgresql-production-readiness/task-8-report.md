# Task 8 report: compiled PostgreSQL application smoke

Date: 2026-08-10
Result: PASS

## Outcome

Migration rehearsal execution now validates the imported schema and then starts a server-owned, compiled application smoke adapter against that same schema. The adapter exercises the real Express application, PostgreSQL repositories/services, and formal deletion API while paid runner, LLM, TTS, and network dependencies are replaced by a typed server-only seam.

The database target is sent to the compiled child only through stdin. It is absent from argv, structured stdout, and persisted readiness reports. The server has no dependency on db-migrator, and db-migrator neither loads server TypeScript nor contains a second business implementation.

## RED evidence

1. Baseline Task 7 PostgreSQL run passed 83/83 assertions but emitted 38 delayed `[observability] PostgreSQL write failed ... database not initialized` messages after test teardown.
2. The first Task 8 RED stopped during module loading because `packages/db-migrator/src/smoke/applicationSmoke` did not exist; zero Task 8 assertions executed.
3. The first integrated run executed 85 tests: 81 passed and 4 failed. Failures isolated the drain test from prior work, exposed missing smoke runtime environment setup, required explicit smoke injection in pre-existing rehearsal tests, and proved the compiled dist rehearsal correctly failed when the real smoke failed.
4. After the queue drain was made awaitable, force-flush exposed a second existing observability defect: standalone LLM probes created 38 orphan OpenTelemetry spans whose `trace_id` had no `game_traces` parent. This produced 38 deterministic foreign-key errors instead of delayed executor errors.
5. Fix Round 1 reproduced five review failures: both successful close and startup failure cleared a pre-existing executor; missing canonical CA input still reached application startup; injected executor capture observed none of the canonical pool/timeout/CA configuration; and a schema with the `trace_spans`/`game_events` cascades removed still passed smoke.

## GREEN implementation

### Compiled adapter boundary

- Extended the existing `tsconfig.rehearsal.json` and `build-rehearsal-adapter.cjs`; one operations compilation emits both rehearsal and smoke adapters plus their shared runtime closure.
- Preserved the Task 6 rehearsal dist entry and canonical migration SQL copy.
- Added a db-migrator smoke orchestrator that spawns only the compiled server adapter and publishes atomic, non-overwriting smoke JSON/Markdown reports.
- Rehearsal calls smoke only after validation passes, uses the already-imported schema, records a smoke artifact, and keeps every report/schema on failure.

### Real application scenario

The smoke scenario verifies these checks in order:

1. `health.connected`
2. `auth.initial-password-change`
3. `config.read-and-crud`
4. `undercover.persisted-without-external-calls`
5. `history.detail-and-replay-order`
6. `memory.created-and-updated`
7. `workflow.observability-delete`
8. `health.disconnected`
9. `teardown.observability-drained`

It starts the real Express app on a random loopback port, reads every required configuration module, performs skin create/update/delete, persists a deterministic `debugMode: false` Undercover game through normal `runSession`/game service/repositories, validates ordered live and stored playback, creates and updates player memory, creates workflow and observability fixtures, and calls the authenticated formal match deletion API. Game, game-player, playback, workflow, trace, trace-span, and game-event rows are removed; cross-game player memory remains. `game_player_selections` is not match-owned: it stores `game_type`-level selection preferences and is deliberately outside the deletion assertion.

The internal dependency seam is the sixth `runSession` parameter. It is not available through WebSocket or HTTP input. The fake config and runner use no API key or voice, emit empty speakable text, and install a network guard; the smoke asserts runner calls equal one and external fetch calls equal zero.

### Teardown and observability fixes

- Per-trace queue entries are removed only when the map still references the same settled promise.
- Drain repeatedly snapshots and awaits the queue until it is stably empty; no sleep or retry is used.
- Shutdown performs provider force-flush/shutdown before draining queued PostgreSQL writes.
- Smoke teardown order is HTTP close, observability shutdown/drain, executor restore and pool close, then test-only schema drop.
- The controlled race test enqueues a write while shutdown is pending and proves all writes complete before shutdown returns.
- Standalone LLM spans without a current game trace now use an OpenTelemetry non-recording span, so they do not initialize a provider or create orphan database rows. Game-scoped spans retain their existing persistence behavior.
- Smoke lifecycle environment changes are precisely restored on both success and a controlled startup failure.
- Smoke lifecycle also restores the exact previous executor on both paths and resolves executor settings through canonical `readDatabaseConfig`, including SSL/CA, pool size, and timeouts.

## Verification

All commands used `pnpm.cmd`. The PostgreSQL URL was process-only and targeted a dedicated `_test` database.

| Command | Result |
| --- | --- |
| `pnpm.cmd run test:postgres` | PASS, 90/90, 0 skipped, 0 observability errors |
| `pnpm.cmd run test:workflow` | PASS, 127/127 |
| `pnpm.cmd run test:unit` | PASS, 337/337 |
| `pnpm.cmd run test:migration` | PASS, 60/60 |
| `pnpm.cmd run check` | PASS, all workspace checks |
| `pnpm.cmd run build:server` | PASS, shared/server and both compiled adapters |
| `pnpm.cmd --filter @ai-presenter/db-migrator build` | PASS |
| compiled db-migrator rehearsal/dist test | PASS, real migration + validation + application smoke without server TypeScript loading |

## File responsibilities

### Added

- `packages/server/smoke/applicationSmokeTypes.ts`: adapter request/response and runtime contracts.
- `packages/server/smoke/applicationSmokeLifecycle.ts`: real app startup, health probe, environment ownership, and strict teardown.
- `packages/server/smoke/applicationSmokeHttp.ts`: bounded JSON HTTP client plus auth/config CRUD protocol.
- `packages/server/smoke/applicationSmokeFixtures.ts`: deterministic players, fake Undercover dependencies, memory/workflow/trace fixtures.
- `packages/server/smoke/applicationSmokeScenario.ts`: ordered smoke acceptance orchestration.
- `packages/server/smoke/applicationSmokeAdapter.ts`: validated stdin/stdout child protocol and observability error capture.
- `packages/db-migrator/src/smoke/applicationSmoke.ts`: compiled child invocation and atomic readiness report publication.
- `tests/postgres/applicationSmoke.test.ts`: queue race/non-recording span proof plus positive and orphan-child compiled smoke assertions.
- `tests/postgres/applicationSmokeLifecycle.test.ts`: executor restoration plus canonical SSL/CA/pool/timeout lifecycle coverage.
- `tests/postgres/smokeHarness.ts`: isolated migrated test schema and application lifecycle helpers.

### Modified

- `packages/server/modules/game-socket/service.ts`: typed server-only `runSession` dependency seam.
- `packages/server/modules/observability/tracer.ts`: race-safe drain, awaitable flush/shutdown, and non-recording standalone LLM spans.
- `packages/server/db/index.ts`: typed current-executor test seam used to restore caller state exactly.
- `packages/server/tsconfig.rehearsal.json`: one compiled operations closure for rehearsal and smoke.
- `packages/server/scripts/build-rehearsal-adapter.cjs`: compatible output/copy layout for both adapters and canonical migrations.
- `packages/db-migrator/src/commands/rehearse.ts`: validation-to-smoke gate and smoke artifact/status propagation.
- `packages/db-migrator/src/index.ts`: public smoke runner types/entry.
- `tests/postgres/rehearsalCommand.test.ts`: explicit successful smoke dependency for non-smoke rehearsal tests.
- `tests/postgres/runPostgresTests.cjs`: Task 8 test registration.
- `docs/project-server.md`, `docs/project-summary.md`, `docs/project-workflow.md`, `docs/postgresql-deployment.md`: runtime, workflow, operations, and teardown contracts.

No API, database schema, or shared type changed. No files were intentionally deleted. The remaining improvement opportunity is operational only: production teams can archive smoke/rehearsal reports into their release evidence store after this local atomic publication step.
