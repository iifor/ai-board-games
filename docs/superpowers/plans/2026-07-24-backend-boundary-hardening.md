# Backend Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate public WebSocket commands, make registered game definitions own public game validation, and close runtime resources deterministically on shutdown.

**Architecture:** Keep each fix at its existing boundary: Zod parsing in `game-socket/session.ts`, socket ownership in `game-socket/service.ts`, registered-game validation in `gameRoutes.ts`, and cleanup orchestration in `lifecycle.ts`. Reuse existing registries, response errors, connection cancellation, SQLite singleton, and OpenTelemetry provider.

**Tech Stack:** TypeScript, Express, ws, Zod, better-sqlite3, OpenTelemetry, Node test runner, pnpm workspace.

## Global Constraints

- Implement in an isolated `codex/backend-boundary-hardening` worktree.
- Preserve all user-authored dirty Undercover client files in the original checkout.
- Do not change database schema, REST paths, outbound WebSocket events, ACK envelopes, game rules, or secret visibility.
- Do not add dependencies, service classes, generic cleanup registries, or a game DSL.
- Use `pnpm.cmd` on Windows.
- For each behavior: write the test, run it and observe the expected failure, then write the minimum production change.

---

### Task 1: Validate Inbound WebSocket Commands

**Files:**

- Modify: `tests/unit/gameSocketSession.test.ts`
- Modify: `packages/server/modules/game-socket/session.ts`
- Modify: `packages/server/modules/game-socket/service.ts`

**Interfaces:**

- Produces: `parseMessage(raw: unknown): SessionMessage | null`
- Produces: `attachGameSocket(server): { close(): Promise<void> }`
- Keeps: all current `start`, `ack`, `control`, and `randomize-teams` fields

- [ ] **Step 1: Add failing parser tests**

Extend `gameSocketSession.test.ts`:

```ts
import {
  createSession,
  isSpeechWaitPayload,
  parseMessage,
} from '../../packages/server/modules/game-socket/session';

test('parseMessage accepts supported game commands', () => {
  assert.deepEqual(parseMessage(JSON.stringify({
    type: 'start',
    gameType: 'undercover',
    playerIds: [1, '2'],
    debugMode: false,
  })), {
    type: 'start',
    gameType: 'undercover',
    playerIds: [1, '2'],
    debugMode: false,
  });
  assert.deepEqual(parseMessage('{"type":"ack","ackId":1}'), {
    type: 'ack',
    ackId: 1,
  });
  assert.deepEqual(parseMessage('{"type":"control","action":"skip-phase"}'), {
    type: 'control',
    action: 'skip-phase',
  });
});

test('parseMessage rejects malformed and unknown commands', () => {
  assert.equal(parseMessage('{'), null);
  assert.equal(parseMessage('{"type":"unknown"}'), null);
  assert.equal(parseMessage('{"type":"ack"}'), null);
  assert.equal(parseMessage('{"type":"control","action":"restart"}'), null);
  assert.equal(parseMessage(JSON.stringify({
    type: 'start',
    playerIds: Array.from({ length: 101 }, (_, index) => index + 1),
  })), null);
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs gameSocketSession.test.ts
```

Expected: FAIL because unknown commands, missing `ackId`, invalid actions, and
unbounded arrays currently parse successfully.

- [ ] **Step 3: Replace JSON-only parsing with a Zod union**

In `session.ts`, import Zod and define:

```ts
import { z } from 'zod';

const playerIdSchema = z.union([
  z.number().int().positive(),
  z.string().max(64).regex(/^\d+$/),
]);
const recordSchema = z.record(z.string(), z.unknown());
const playerIdListSchema = z.array(playerIdSchema).max(100);
const debateTeamsSchema = z.object({
  proIds: playerIdListSchema.optional(),
  conIds: playerIdListSchema.optional(),
  judgeIds: playerIdListSchema.optional(),
}).passthrough();

const sessionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    mode: z.string().max(16).optional(),
    playerIds: playerIdListSchema.optional(),
    gameType: z.string().min(1).max(64).optional(),
    topic: recordSchema.optional(),
    debateTeams: debateTeamsSchema.optional(),
    werewolfMode: z.union([z.string().max(64), recordSchema]).optional(),
    replayGameId: z.string().min(1).max(128).optional(),
    clientViewMode: z.string().max(32).optional(),
    debugMode: z.boolean().optional(),
    replayView: recordSchema.optional(),
  }).strict(),
  z.object({
    type: z.literal('ack'),
    ackId: z.union([z.number().finite(), z.string().min(1).max(64)]),
  }).strict(),
  z.object({
    type: z.literal('control'),
    action: z.enum(['pause', 'resume', 'skip-phase']),
  }).strict(),
  z.object({
    type: z.literal('randomize-teams'),
    playerIds: playerIdListSchema.optional(),
  }).strict(),
]);

type SessionMessage = z.infer<typeof sessionMessageSchema>;
```

Implement:

```ts
function parseMessage(raw: unknown): SessionMessage | null {
  try {
    const result = sessionMessageSchema.safeParse(JSON.parse(String(raw)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
```

Export `SessionMessage`. Remove the duplicate `SessionMessage` interface from
`service.ts` and import the inferred type.

- [ ] **Step 4: Reject invalid messages and cap inbound payload**

In `service.ts`:

```ts
const GAME_SOCKET_MAX_PAYLOAD_BYTES = 64 * 1024;

const wss = new WebSocketServer({
  server,
  path: '/api/toc/ws/game',
  maxPayload: GAME_SOCKET_MAX_PAYLOAD_BYTES,
});
```

Replace the silent invalid-message return with:

```ts
if (!message) {
  session.send({
    type: 'error',
    code: 'INVALID_MESSAGE',
    message: '无效的游戏指令。',
  });
  return;
}
```

Use the inferred message type directly and remove the non-null `ackId`
assertion.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs gameSocketSession.test.ts
pnpm.cmd --filter @ai-presenter/server run check
```

Expected: PASS with no TypeScript casts needed for the inbound command.

---

### Task 2: Make Public Game Validation Definition-Driven

**Files:**

- Modify: `tests/unit/undercoverGameRunner.test.ts`
- Modify: `packages/server/routes/gameRoutes.ts`
- Modify: `packages/server/modules/debate/definition.ts`
- Modify: `packages/server/modules/werewolf/definition.ts`
- Modify: `packages/server/modules/games/utils.ts`

**Interfaces:**

- Produces: `normalizeGameType(value: string): string`
- Produces: `validatePlayerSelection(gameType: string, playerIds: number[]): void`
- Consumes: `GameDefinition.metadata.session.playerSelection`

- [ ] **Step 1: Add failing definition-driven validation tests**

Extend `undercoverGameRunner.test.ts`:

```ts
import {
  normalizeGameType,
  validatePlayerSelection,
} from '../../packages/server/routes/gameRoutes';

test('public validation accepts every registered game definition', () => {
  assert.equal(normalizeGameType('debate'), 'debate');
  assert.equal(normalizeGameType('werewolf'), 'werewolf');
  assert.equal(normalizeGameType('undercover'), 'undercover');
  assert.throws(() => normalizeGameType('unknown-game'), /未知游戏类型/);
});

test('public player selection uses definition metadata', () => {
  assert.doesNotThrow(() => validatePlayerSelection('debate', ids(8)));
  assert.throws(() => validatePlayerSelection('debate', ids(7)), /8-12/);
  assert.doesNotThrow(() => validatePlayerSelection('werewolf', ids(12)));
  assert.throws(() => validatePlayerSelection('werewolf', ids(11)), /12/);
  assert.doesNotThrow(() => validatePlayerSelection('undercover', ids(6)));
  assert.throws(() => validatePlayerSelection('undercover', ids(5)), /6/);
});
```

Reuse or add the local helper:

```ts
function ids(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs undercoverGameRunner.test.ts
```

Expected: FAIL because `undercover` is rejected and has no route-level player
count validation.

- [ ] **Step 3: Declare existing selection contracts**

Add to Debate definition session metadata:

```ts
playerSelection: {
  min: 8,
  max: 12,
  errorMessage: 'AI 辩论赛需要选择 8-12 位 AI 玩家。',
},
```

Add to Werewolf definition session metadata:

```ts
playerSelection: {
  min: 12,
  max: 12,
  errorMessage: 'AI 狼人杀需要选择恰好 12 位 AI 玩家。',
},
```

- [ ] **Step 4: Resolve route validation through the registry**

Import `getGameEngine` in `gameRoutes.ts`. Implement and export:

```ts
function normalizeGameType(value: string): string {
  const gameType = value.trim().toLowerCase();
  const definition = getGameEngine().getDefinition(gameType);
  if (!definition) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `未知游戏类型：${value}`,
      400,
    );
  }
  return definition.gameType;
}

function validatePlayerSelection(gameType: string, playerIds: number[]): void {
  const selection = getGameEngine()
    .getDefinition(gameType)
    ?.metadata?.session?.playerSelection;
  if (
    selection
    && (playerIds.length < selection.min || playerIds.length > selection.max)
  ) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      selection.errorMessage,
      400,
    );
  }
}
```

Keep the default router export and add named exports for these two pure contract
helpers.

- [ ] **Step 5: Delete dead legacy normalization**

`packages/server/modules/games/utils.ts` has no callers for
`normalizeGameType()` or `getGameTypeName()`. Delete those functions and remove
them from the export list. Keep row mapping and JSON helpers unchanged.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs undercoverGameRunner.test.ts
pnpm.cmd --filter @ai-presenter/server run check
```

Expected: PASS for all three registered games and unknown-type rejection.

---

### Task 3: Close Runtime Resources Deterministically

**Files:**

- Modify: `tests/unit/serverLifecycle.test.ts`
- Modify: `packages/server/modules/game-socket/service.ts`
- Modify: `packages/server/lifecycle.ts`
- Modify: `packages/server/db/index.ts`
- Modify: `packages/server/modules/observability/tracer.ts`
- Modify: `packages/server/modules/observability/index.ts`
- Modify: `packages/server/index.ts`

**Interfaces:**

- Produces: `GameSocketHandle.close(): Promise<void>`
- Produces: `closeDb(): void`
- Produces: `shutdownObservability(): Promise<void>`
- Extends: `GracefulShutdownOptions.cleanup?: () => Promise<void> | void`

- [ ] **Step 1: Add failing lifecycle tests**

Extend `serverLifecycle.test.ts` with an async cleanup order assertion:

```ts
test('graceful shutdown cleans resources before closing HTTP', async () => {
  const exits: number[] = [];
  const timers: TestTimer[] = [];
  const order: string[] = [];
  const server = {
    close(callback: (error?: Error) => void) {
      order.push('http');
      callback();
    },
  };
  const shutdown = createGracefulShutdownHandler(server, {
    ...createTestOptions(exits, timers),
    cleanup: async () => {
      order.push('cleanup');
    },
  });

  shutdown('SIGTERM');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(order, ['cleanup', 'http']);
  assert.deepEqual(exits, [0]);
});

test('graceful shutdown exits non-zero when cleanup fails', async () => {
  const exits: number[] = [];
  const timers: TestTimer[] = [];
  let closes = 0;
  const shutdown = createGracefulShutdownHandler(
    { close: () => { closes += 1; } },
    {
      ...createTestOptions(exits, timers),
      cleanup: async () => {
        throw new Error('cleanup failed');
      },
    },
  );

  shutdown('SIGTERM');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(closes, 0);
  assert.deepEqual(exits, [1]);
});
```

Adapt the three existing assertions to await one event-loop turn because the
handler becomes asynchronous internally.

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs serverLifecycle.test.ts
```

Expected: FAIL because `cleanup` is not accepted or called.

- [ ] **Step 3: Add the minimal cleanup option**

Extend `GracefulShutdownOptions`:

```ts
cleanup?: () => Promise<void> | void;
```

Inside the signal handler, keep the existing timer and idempotency guard, then:

```ts
void Promise.resolve()
  .then(() => options.cleanup?.())
  .then(() => {
    server.close((error) => finish(error ? 1 : 0));
  })
  .catch(() => finish(1));
```

Do not add a cleanup registry or signal abstraction.

- [ ] **Step 4: Return a closeable WebSocket handle**

In `attachGameSocket()` return:

```ts
return {
  close: () => new Promise<void>((resolve, reject) => {
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close((error) => error ? reject(error) : resolve());
  }),
};
```

Export the small handle type. Existing socket `close` listeners will reject
pending ACK waits through the current cancellation path.

- [ ] **Step 5: Expose database and observability cleanup**

In `db/index.ts`:

```ts
function closeDb(): void {
  const current = connection as (Database | JsonDb) & { close?: () => void };
  current?.close?.();
  connection = null;
}
```

Export `closeDb`.

In `tracer.ts`, make `SqliteSpanExporter.shutdown()` resolve without calling
the owning provider, then add:

```ts
async function shutdownObservability(): Promise<void> {
  const provider = tracerProvider;
  tracerProvider = null;
  otelTracer = null;
  if (provider) await provider.shutdown();
}
```

Export it through `modules/observability/index.ts`.

- [ ] **Step 6: Wire cleanup in the composition root**

In `index.ts`:

```ts
const gameSocket = attachGameSocket(server);
const shutdown = createGracefulShutdownHandler(server, {
  cleanup: async () => {
    await gameSocket.close();
    await shutdownObservability();
    closeDb();
  },
});
```

Import the existing module exports. Keep both signal registrations and the
10-second fallback.

- [ ] **Step 7: Verify GREEN**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs serverLifecycle.test.ts
pnpm.cmd --filter @ai-presenter/server run check
```

Expected: PASS with cleanup before HTTP close, one exit, and non-zero failure
behavior.

---

### Task 4: Synchronize Contracts and Run the Full Gate

**Files:**

- Modify: `docs/project-server.md`
- Modify: `docs/project-workflow.md`
- Modify: `docs/project-shared.md`
- Verify: all files changed by Tasks 1–3

- [ ] **Step 1: Update documentation**

Document:

- registered definitions own public game types and saved-selection bounds;
- inbound WebSocket commands are schema-validated and capped at 64 KiB;
- invalid commands return `INVALID_MESSAGE`;
- shutdown closes WebSocket sessions, HTTP, OpenTelemetry, and SQLite under the
  existing 10-second ceiling;
- no schema or outbound protocol changed.

- [ ] **Step 2: Run focused tests**

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs gameSocketSession.test.ts
pnpm.cmd exec node tests/unit/runUnitTests.cjs undercoverGameRunner.test.ts
pnpm.cmd exec node tests/unit/runUnitTests.cjs serverLifecycle.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 3: Run repository verification**

```powershell
pnpm.cmd run test:unit
pnpm.cmd run check
pnpm.cmd run build:server
git diff --check
```

Expected: zero failed tests, zero TypeScript errors, successful server build,
and no whitespace errors.

- [ ] **Step 4: Review scope**

Confirm:

- no client file changed;
- no database migration or stored data changed;
- no outbound WebSocket event changed;
- no new dependency or generic framework was added;
- original checkout dirty files remain untouched.
