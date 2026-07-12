# Concurrency Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely support five concurrent games with bounded LLM/TTS traffic, per-session start protection, isolated traces, and a reproducible load test.

**Architecture:** Add one dependency-free FIFO limiter and process-local game capacity manager. Apply them at the existing WebSocket, LLM, and TTS network boundaries, and replace the trace global context with `AsyncLocalStorage` scoped by each runner.

**Tech Stack:** TypeScript, Node.js, ws, OpenTelemetry, SQLite, Node test runner.

## Global Constraints

- Defaults: games 5, LLM 8, TTS 4.
- No Redis, queue dependency, API schema, WebSocket schema, or database migration.
- Replays do not consume live-game capacity.
- Tests must fail before production changes are written.

---

### Task 1: FIFO concurrency primitive and game capacity

**Files:**
- Create: `packages/server/utils/concurrencyLimiter.ts`
- Create: `packages/server/modules/game-socket/capacity.ts`
- Create: `tests/unit/concurrencyLimiter.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**
- Produces: `createConcurrencyLimiter(limit)`, `run(task)`, `stats()`; `tryAcquireGame()`, `releaseGame()`, `gameCapacityStats()`.

- [ ] Write tests proving FIFO order, active-count limits, release after rejection, five successful game leases, and sixth rejection.
- [ ] Run `pnpm.cmd run test:unit` and verify RED from missing modules.
- [ ] Implement the minimum promise queue and synchronous game lease counter with positive environment parsing.
- [ ] Run unit tests and verify GREEN.

### Task 2: WebSocket session start guard

**Files:**
- Modify: `packages/server/modules/game-socket/service.ts`
- Test: `tests/unit/gameSessionConcurrency.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**
- Consumes: game capacity lease.
- Produces: `当前连接已有游戏正在运行` for duplicate start and `服务器繁忙，请稍后重试` when capacity is full.

- [ ] Add a failing test around an exported start guard proving duplicate rejection, sixth-live-game rejection, and release in `finally`.
- [ ] Implement one `WeakSet<GameSession>` plus live-game lease acquisition around `runSession`; replays only use the WeakSet.
- [ ] Verify the focused and full unit suites.

### Task 3: LLM and TTS global limits

**Files:**
- Modify: the existing LLM HTTP request boundary located by CodeGraph.
- Modify: the existing Azure/MiMo TTS request boundary located by CodeGraph.
- Create: `packages/server/utils/concurrency.ts`
- Test: `tests/unit/upstreamConcurrency.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**
- Produces: shared `llmLimiter` default 8 and `ttsLimiter` default 4 with structured stats.

- [ ] Write failing tests that launch more operations than each limit and assert observed active maxima.
- [ ] Wrap LLM retry lifecycles and TTS cache-miss upstream calls with their limiter; cache hits remain outside.
- [ ] Count LLM 429 responses and TTS timeout failures in process-local metrics.
- [ ] Verify focused tests and all unit tests.

### Task 4: Async-local trace isolation

**Files:**
- Modify: `packages/server/modules/observability/tracer.ts`
- Modify: `packages/server/modules/werewolf-runner.ts`
- Modify: `packages/server/modules/debate-runner.ts`
- Test: `tests/unit/traceConcurrency.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**
- Produces: `runWithTraceContext(traceContext, task)` and async-local parent context lookup.

- [ ] Write a failing test running five overlapping contexts and asserting distinct current trace IDs.
- [ ] Replace `_rootCtx` with `AsyncLocalStorage<Context>` and store the OpenTelemetry root context on `TraceContext`.
- [ ] Run each real game workflow inside its trace context; keep explicit flush/status APIs unchanged.
- [ ] Verify trace tests and full suites.

### Task 5: Metrics, five-game load test, docs, and release gates

**Files:**
- Create: `tests/load/fiveConcurrentGames.cjs`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `docs/project-server.md`
- Modify: `docs/project-workflow.md`
- Modify: `docs/project-summary.md`

**Interfaces:**
- Produces: `pnpm run test:concurrency` and one structured JSON summary containing game/LLM/TTS counts, event-loop delay, memory peak, 429, and timeout counts.

- [ ] Add a script that starts five concurrent WebSocket clients against a supplied local URL, samples `monitorEventLoopDelay` and memory, and exits nonzero on rejection, timeout, or limiter breach.
- [ ] Add environment examples and document single-process scope and overload behavior.
- [ ] Run check, build, unit, workflow, migration, and concurrency verification; report external-provider or local-server prerequisites exactly.
