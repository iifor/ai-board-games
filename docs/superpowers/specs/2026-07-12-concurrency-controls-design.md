# Concurrency Controls Design

## Goal

Support five simultaneous games predictably in the current single-process deployment while preventing duplicate starts, unbounded upstream requests, and cross-game trace contamination.

## Capacity Contract

- `MAX_CONCURRENT_GAMES=5`: game starts above the limit are rejected immediately with `服务器繁忙，请稍后重试`.
- `MAX_CONCURRENT_LLM_REQUESTS=8`: excess LLM requests wait in FIFO order.
- `MAX_CONCURRENT_TTS_REQUESTS=4`: cache misses that require an upstream TTS request wait in FIFO order; cache hits do not consume capacity.
- Invalid, zero, or negative environment values fall back to these defaults.

## WebSocket Session Rules

Each `GameSession` may own at most one active `runSession` call. A repeated `start` on the same connection is rejected with `当前连接已有游戏正在运行`.

The server acquires a global game lease before creating the workflow. It releases the session state and global lease in `finally` after success, failure, cancellation, or disconnect. Replay sessions are included in the per-session rule but do not consume a live-game lease.

No WebSocket payload shape changes. Rejections reuse the existing `{ type: 'error', message }` event.

## Shared Concurrency Limiter

Add one dependency-free FIFO semaphore with:

- a fixed positive limit;
- `run(task)` for acquisition and guaranteed release;
- observable `active`, `queued`, and `limit` counts;
- no cancellation or priority system in this version.

LLM and TTS use separate limiter instances. The limiter wraps only the external network request and its retry attempts, not prompt construction, cache lookup, response projection, or playback.

## Trace Isolation

Replace the global OpenTelemetry `_rootCtx` with `AsyncLocalStorage<Context>`. A trace context stores its OpenTelemetry root context, and each game runner executes its asynchronous workflow inside that context.

Child span creation reads the current async-local context, falling back to `context.active()` only when no game trace exists. The existing `activeTraces` map remains keyed by game ID for explicit status lookup and flush operations.

## Metrics

Expose structured log records during the concurrency test for:

- active and rejected games;
- LLM active/queued and HTTP 429 count;
- TTS active/queued and timeout count;
- event-loop delay percentiles from `node:perf_hooks`;
- process RSS and heap peak;
- existing workflow transaction timing records.

No metrics database or monitoring dependency is added.

## Verification

Automated tests must prove:

- a second start on one session is rejected;
- five live-game leases can coexist and the sixth is rejected;
- leases are released after success and failure;
- LLM never exceeds eight simultaneous upstream operations;
- TTS never exceeds four simultaneous upstream operations;
- five concurrent traces retain distinct trace IDs and parent contexts.

A reproducible five-client load script starts five WebSocket games concurrently against a local server, captures structured metrics, and exits nonzero on a rejected first-five start, stuck game, uncaught error, or breached limiter. Local stub endpoints simulate LLM 429 and TTS timeout behavior without consuming real provider quota.

## Boundaries

- Single Node.js process and single SQLite connection remain the deployment model.
- No Redis, job queue, new dependency, API change, WebSocket schema change, or database migration.
- Multi-instance coordination remains out of scope; process-local limits are not cluster-wide limits.
