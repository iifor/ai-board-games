# P0 Reliability and Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the approved P0 reliability and mobile-readiness slice without changing game rules, secret-information semantics, database schema, or the existing Undercover presentation work.

**Architecture:** Keep the server authoritative by deriving public route constraints from registered `GameDefinition` metadata, fail closed when a Werewolf player-view identity cannot be resolved, and split liveness from public bootstrap data. Keep frontend changes inside existing feature modules: the game-selection page consumes the bootstrap endpoint and exposes recent-match loading errors, while targeted mobile CSS reflows the existing Werewolf v2 components without replacing the desktop stage or the global px-to-vw plugin.

**Tech Stack:** TypeScript, React, Express, Drizzle/SQLite, Node test runner, pnpm workspace scripts, PostCSS/Vite, Playwright through the in-app browser.

## Global Constraints

- Preserve all user-authored dirty files in the original checkout; implementation happens in an isolated Git worktree on `codex/p0-reliability-mobile`.
- Reuse `GameDefinitionRegistry`, `GameEngine`, existing Express error handling, `gameService`, existing Werewolf v2 components, and existing public replay/view-policy boundaries.
- Do not add a fourth game, a universal rules DSL, new database tables, new protocol events, a storage redesign, or data cleanup.
- Do not expose AI provider, model, base URL, environment-variable names, API-key presence, or readiness topology through public endpoints.
- Do not silently downgrade an unresolved player view to god view.
- Do not modify `px2vwPlugin`; mobile overrides use `rem`, `%`, `svh`, `dvh`, and safe-area values under `@media (max-width: 48rem)`.
- Use `pnpm.cmd` for all workspace commands on Windows.
- Apply test-first steps before implementation code for every behavior with an automatable contract.

---

## Task 1: Isolate Unit-Test Databases

**Files:**

- Create: `tests/unit/testEnvironmentIsolation.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`
- Modify: `packages/server/db/index.ts`
- Test: `tests/unit/testEnvironmentIsolation.test.ts`

- [ ] **Step 1: Add the failing database-isolation test**

Create `tests/unit/testEnvironmentIsolation.test.ts`:

```ts
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getDatabasePath, getDb } from '../../packages/server/db';

test('unit tests use a disposable database outside the repository data directory', () => {
  const db = getDb();
  const databasePath = path.resolve(getDatabasePath());
  const sqliteDatabasePath = path.resolve(process.env.DATABASE_PATH ?? '');
  const jsonDatabasePath = path.resolve(process.env.JSON_DATABASE_PATH ?? '');
  const repositoryDataDirectory = path.resolve(__dirname, '../../packages/data');
  const temporaryDirectory = path.resolve(os.tmpdir());

  assert.ok([sqliteDatabasePath, jsonDatabasePath].includes(databasePath));
  assert.ok(sqliteDatabasePath.startsWith(temporaryDirectory + path.sep));
  assert.ok(databasePath.startsWith(temporaryDirectory + path.sep));
  assert.ok(jsonDatabasePath.startsWith(temporaryDirectory + path.sep));
  assert.ok(!databasePath.startsWith(repositoryDataDirectory + path.sep));
  assert.ok(!jsonDatabasePath.startsWith(repositoryDataDirectory + path.sep));
  assert.doesNotThrow(() => db.prepare('SELECT 1 AS value').get());
});
```

Append the test path to `testFiles` in `tests/unit/runUnitTests.cjs`.

- [ ] **Step 2: Run the new test and confirm the current runner fails**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs testEnvironmentIsolation.test.ts
```

Expected: FAIL because the runner has not assigned disposable `DATABASE_PATH` and `JSON_DATABASE_PATH` values.

- [ ] **Step 3: Add an explicit database close boundary**

Add to `packages/server/db/index.ts`:

```ts
export function closeDb(): void {
  if (!connection) {
    return;
  }

  const closable = connection as unknown as { close?: () => void };
  if (typeof closable.close === 'function') {
    closable.close();
  }
  connection = null;
}
```

This is lifecycle cleanup only; it does not change the repository abstraction or schema.

- [ ] **Step 4: Configure and clean a unique temp directory in the unit runner**

Near the top of `tests/unit/runUnitTests.cjs`, after resolving `root`, add:

```js
const os = require('node:os');
const testDatabaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'consensus-unit-'));
process.env.DATABASE_PATH = path.join(testDatabaseRoot, 'unit.sqlite');
process.env.JSON_DATABASE_PATH = path.join(testDatabaseRoot, 'unit.json');

let testDatabaseCleaned = false;
function cleanupTestDatabase() {
  if (testDatabaseCleaned) {
    return;
  }
  testDatabaseCleaned = true;

  const dbModulePath = path.join(root, 'packages', 'server', 'db', 'index.ts');
  require.cache[dbModulePath]?.exports?.closeDb?.();
  fs.rmSync(testDatabaseRoot, { recursive: true, force: true });
}

process.once('beforeExit', cleanupTestDatabase);
process.once('SIGINT', () => {
  cleanupTestDatabase();
  process.exitCode = 130;
});
```

Keep the environment assignment before loading any server module because `packages/server/db/index.ts` resolves its path at import time.

- [ ] **Step 5: Run the focused test and the existing database-backed tests**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs testEnvironmentIsolation.test.ts
pnpm.cmd exec node tests/unit/runUnitTests.cjs tocPublicRoutes.test.ts
```

Expected: PASS; the first command prints a path under the operating-system temp directory only if a failure occurs.

- [ ] **Step 6: Commit the database-isolation slice**

```powershell
git add tests/unit/testEnvironmentIsolation.test.ts tests/unit/runUnitTests.cjs packages/server/db/index.ts
git commit -m "test: isolate unit database state"
```

---

## Task 2: Make Public Game Routes Definition-Driven and Redacted

**Files:**

- Create: `tests/unit/tocPublicRoutes.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`
- Modify: `packages/server/app.ts`
- Modify: `packages/server/routes/gameRoutes.ts`
- Modify: `packages/server/modules/debate/definition.ts`
- Modify: `packages/server/modules/werewolf/definition.ts`
- Test: `tests/unit/tocPublicRoutes.test.ts`

- [ ] **Step 1: Add the failing public-route contract test**

Create `tests/unit/tocPublicRoutes.test.ts` with one ephemeral HTTP server:

```ts
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../../packages/server/app';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

test('public TOC routes are redacted and validate registered game definitions', async () => {
  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const healthResponse = await fetch(`${baseUrl}/api/toc/health`);
    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.headers.get('x-powered-by'), null);
    const health = await healthResponse.json() as ApiEnvelope<{
      ok: boolean;
      service: string;
    }>;
    assert.deepEqual(health.data, {
      ok: true,
      service: 'ai-presenter-api',
    });

    const bootstrapResponse = await fetch(`${baseUrl}/api/toc/bootstrap`);
    assert.equal(bootstrapResponse.status, 200);
    const bootstrapEnvelope = await bootstrapResponse.json() as ApiEnvelope<{
      players: Array<Record<string, unknown>>;
    }>;
    const bootstrap = bootstrapEnvelope.data;
    assert.ok(Array.isArray(bootstrap.players));
    for (const player of bootstrap.players) {
      assert.deepEqual(
        Object.keys(player).sort(),
        ['avatar', 'avatarUrl', 'id', 'nickname', 'personality', 'sex', 'voicePackageId'].sort(),
      );
    }
    assert.ok(!JSON.stringify(bootstrap).includes('apiKeyEnv'));
    assert.ok(!JSON.stringify(bootstrap).includes('hasApiKey'));

    const selectedPlayerIds = bootstrap.players
      .slice(0, 6)
      .map((player) => Number(player.id));
    assert.equal(selectedPlayerIds.length, 6);

    const recentResponse = await fetch(
      `${baseUrl}/api/toc/games/recent?gameType=undercover&limit=10`,
    );
    assert.equal(recentResponse.status, 200);

    const validSelectionResponse = await fetch(`${baseUrl}/api/toc/player-selections/undercover`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerIds: selectedPlayerIds }),
    });
    assert.equal(validSelectionResponse.status, 200);

    const invalidSelectionResponse = await fetch(`${baseUrl}/api/toc/player-selections/undercover`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerIds: selectedPlayerIds.slice(0, 5) }),
    });
    assert.equal(invalidSelectionResponse.status, 400);

    const unknownGameResponse = await fetch(
      `${baseUrl}/api/toc/games/recent?gameType=not-registered`,
    );
    assert.equal(unknownGameResponse.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
```

Append this file to `testFiles` in `tests/unit/runUnitTests.cjs`.

- [ ] **Step 2: Run the route test and confirm the current failures**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs tocPublicRoutes.test.ts
```

Expected: FAIL because `/api/toc/health` exposes configuration, `/api/toc/bootstrap` does not exist, Undercover is rejected by local hard-coded normalization, and Express sends `X-Powered-By`.

- [ ] **Step 3: Declare selection constraints in each registered definition**

Add to `createDebateGameDefinition().metadata.session`:

```ts
playerSelection: {
  min: 8,
  max: 12,
  errorMessage: '辩论赛需要选择 8 至 12 名玩家',
},
```

Add to `createWerewolfGameDefinition().metadata.session`:

```ts
playerSelection: {
  min: 12,
  max: 12,
  errorMessage: '狼人杀需要选择 12 名玩家',
},
```

Keep the existing Undercover `6/6` metadata unchanged.

- [ ] **Step 4: Replace the route-local game whitelist with registry lookup**

In `packages/server/routes/gameRoutes.ts`, import `getGameEngine` from
`../modules/engine-registry` and add:

```ts
function getPublicGameDefinition(gameType: string) {
  const normalizedGameType = gameType.trim().toLowerCase();
  const definition = getGameEngine().getDefinition(normalizedGameType);
  if (!definition) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `不支持的游戏类型: ${gameType}`,
      400,
    );
  }
  return definition;
}

function normalizePublicGameType(gameType: string): string {
  return getPublicGameDefinition(gameType).gameType;
}

function validateSelectedPlayers(gameType: string, playerIds: number[]): void {
  const selection = getPublicGameDefinition(gameType).metadata.session?.playerSelection;
  if (!selection) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `游戏 ${gameType} 未配置玩家选择规则`,
      400,
    );
  }

  if (
    playerIds.length < selection.min
    || playerIds.length > selection.max
  ) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      selection.errorMessage,
      400,
    );
  }
}
```

Use `normalizePublicGameType` in both the player-selection and recent-game routes. Delete the debate/werewolf hard-coded switch and its generic `Error`.

- [ ] **Step 5: Split liveness from public bootstrap**

Replace the health response with:

```ts
router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-presenter-api' });
});
```

Add:

```ts
router.get('/bootstrap', async (_req, res, next) => {
  try {
    const players = getAiConfig().players;
    res.json({
      players: players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        avatarUrl: player.avatarUrl,
        sex: player.sex,
        personality: player.personality,
        voicePackageId: player.voicePackageId,
      })),
    });
  } catch (error) {
    next(error);
  }
});
```

Reuse the existing `getAiConfig()` normalization, but project its result to the
seven explicit public presentation fields before sending it.

- [ ] **Step 6: Disable the Express implementation header**

Immediately after `const app = express()` in `packages/server/app.ts`, add:

```ts
app.disable('x-powered-by');
```

- [ ] **Step 7: Run the public route test**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs tocPublicRoutes.test.ts
```

Expected: PASS for minimal health, public bootstrap shape, Undercover recent route, six-player selection, invalid selection, unknown type, and absent `X-Powered-By`.

- [ ] **Step 8: Commit the route contract slice**

```powershell
git add tests/unit/tocPublicRoutes.test.ts tests/unit/runUnitTests.cjs packages/server/app.ts packages/server/routes/gameRoutes.ts packages/server/modules/debate/definition.ts packages/server/modules/werewolf/definition.ts
git commit -m "fix: harden public game routes"
```

---

## Task 3: Move the Client to Public Bootstrap and Expose Recent-Game Failures

**Files:**

- Create: `tests/unit/gameService.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`
- Modify: `packages/client/src/services/gameService.ts`
- Modify: `packages/client/src/features/debate/DebateGame/index.tsx`
- Modify: `packages/client/src/pages/GameSelectPage/index.tsx`
- Modify: `packages/client/src/pages/GameSelectPage/index.css`
- Test: `tests/unit/gameService.test.ts`

- [ ] **Step 1: Add the failing client service test**

Create `tests/unit/gameService.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAiBootstrap, fetchAiPlayers } from '../../packages/client/src/services/gameService';

test('AI bootstrap consumers use the public bootstrap endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify({
      players: [{
        id: 'p1',
        nickname: '豆包',
        avatar: '',
        avatarUrl: '',
        sex: 'female',
        personality: 'calm',
        voicePackageId: 'voice-1',
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const bootstrap = await fetchAiBootstrap();
    const players = await fetchAiPlayers();
    assert.equal(bootstrap.players.length, 1);
    assert.equal(players[0]?.nickname, '豆包');
    assert.deepEqual(requestedUrls, ['/api/toc/bootstrap', '/api/toc/bootstrap']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

Append this test to `testFiles`.

- [ ] **Step 2: Run the service test and confirm the missing export**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs gameService.test.ts
```

Expected: FAIL because `fetchAiBootstrap` does not exist and `fetchAiPlayers` still uses `/api/toc/health`.

- [ ] **Step 3: Replace the health-shaped client API with bootstrap**

In `packages/client/src/services/gameService.ts`, replace `AiHealth` with:

```ts
export interface AiBootstrap {
  players: Player[];
}

export async function fetchAiBootstrap(): Promise<AiBootstrap> {
  return requestJson<AiBootstrap>('/api/toc/bootstrap');
}

export async function fetchAiPlayers(): Promise<Player[]> {
  const bootstrap = await fetchAiBootstrap();
  return bootstrap.players;
}
```

Remove `fetchAiHealth`. Update `DebateGame` to import and call `fetchAiBootstrap` where it currently consumes `health.players`.

- [ ] **Step 4: Give recent-game loading an explicit per-game state**

In `GameSelectPage/index.tsx`, add:

```ts
type RecentLoadStatus = 'loading' | 'ready' | 'error';

const [recentStatuses, setRecentStatuses] = useState<Record<string, RecentLoadStatus>>(
  () => Object.fromEntries(games.map((game) => [game.key, 'loading'])),
);
```

Replace the swallowed `.catch(() => [])` flow with individually handled requests:

```ts
useEffect(() => {
  let cancelled = false;

  void Promise.all(games.map(async (game) => {
    setRecentStatuses((current) => ({
      ...current,
      [game.key]: 'loading',
    }));

    try {
      const records = await fetchRecentGames(game.key);
      if (cancelled) return;
      setRecentGames((current) => ({
        ...current,
        [game.key]: records,
      }));
      setRecentStatuses((current) => ({
        ...current,
        [game.key]: 'ready',
      }));
    } catch {
      if (cancelled) return;
      setRecentStatuses((current) => ({
        ...current,
        [game.key]: 'error',
      }));
    }
  }));

  return () => {
    cancelled = true;
  };
}, []);
```

Pass `status={recentStatuses[game.key] ?? 'loading'}` to the page-local
`RecentGameList`.

- [ ] **Step 5: Render loading, failure, and empty states distinctly**

Extend the page-local `RecentGameList` props:

```ts
interface RecentGameListProps {
  gameType: string;
  games: Record<string, unknown>[];
  status: 'loading' | 'ready' | 'error';
  onOpen: (game: Record<string, unknown>) => void;
}
```

Render:

```tsx
if (status === 'loading') {
  return <div className="recent-game-state">正在加载最近对局…</div>;
}

if (status === 'error') {
  return (
    <div className="recent-game-state recent-game-state--error" role="status">
      最近对局加载失败，请稍后重试
    </div>
  );
}

if (games.length === 0) {
  return <div className="recent-game-state">暂无最近对局</div>;
}
```

Add corresponding compact `.recent-game-state` styles in
`GameSelectPage/index.css`, preserving the existing list markup.

- [ ] **Step 6: Run focused service tests and client type checks**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs gameService.test.ts
pnpm.cmd --filter @ai-presenter/client run typecheck
```

Expected: PASS; no client import references `/api/toc/health` for player bootstrap.

- [ ] **Step 7: Commit the client contract slice**

```powershell
git add tests/unit/gameService.test.ts tests/unit/runUnitTests.cjs packages/client/src/services/gameService.ts packages/client/src/features/debate/DebateGame/index.tsx packages/client/src/pages/GameSelectPage/index.tsx packages/client/src/pages/GameSelectPage/index.css
git commit -m "fix: separate client bootstrap state"
```

---

## Task 4: Fail Closed for Unresolved Werewolf Player Views

**Files:**

- Modify: `tests/unit/werewolfChannelGuard.test.ts`
- Modify: `packages/server/modules/werewolf/views/viewPolicy.ts`
- Test: `tests/unit/werewolfChannelGuard.test.ts`

- [ ] **Step 1: Add failing view-policy assertions**

Extend `tests/unit/werewolfChannelGuard.test.ts`:

```ts
assert.throws(
  () => createProjectionContext(state, { mode: 'player' }),
  (error: unknown) => (
    error instanceof Error
    && error.message.includes('VISIBILITY_POLICY_FAILED')
  ),
);

assert.throws(
  () => createProjectionContext(state, {
    mode: 'player',
    viewerPlayerId: 'missing-player',
  }),
  (error: unknown) => (
    error instanceof Error
    && error.message.includes('VISIBILITY_POLICY_FAILED')
  ),
);
```

Use the test file's existing state fixture and error assertion conventions rather than introducing a second fixture.

- [ ] **Step 2: Run the focused test and confirm god-view fallback**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs werewolfChannelGuard.test.ts
```

Expected: FAIL because `createProjectionContext` currently logs and returns `{ mode: 'god' }`.

- [ ] **Step 3: Replace fallback with the existing abortable boundary**

In `viewPolicy.ts`, replace the warning-and-god branch with:

```ts
assertAbortableWerewolfBoundary(
  viewer,
  'VISIBILITY_POLICY_FAILED',
  '玩家视角缺少有效的观察者身份',
);
```

Continue constructing the player projection only after the assertion. Keep `createAudienceSession` random player assignment unchanged because it is the documented public session behavior, not a persisted-view recovery path.

- [ ] **Step 4: Run the focused Werewolf security test**

Run:

```powershell
pnpm.cmd exec node tests/unit/runUnitTests.cjs werewolfChannelGuard.test.ts
```

Expected: PASS for missing viewer, invalid viewer, and all existing secret-channel guards.

- [ ] **Step 5: Commit the fail-closed slice**

```powershell
git add tests/unit/werewolfChannelGuard.test.ts packages/server/modules/werewolf/views/viewPolicy.ts
git commit -m "fix: fail closed on missing werewolf viewer"
```

---

## Task 5: Add Real Mobile Reflow for Game Selection and Werewolf v2

**Files:**

- Modify: `packages/client/src/pages/GameSelectPage/index.css`
- Modify: `packages/client/src/features/werewolf-v2/WerewolfGameV2/index.css`
- Modify: `packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.css`
- Modify: `packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.css`
- Modify: `packages/client/src/features/werewolf-v2/components/WerewolfBottomSpeechBar/index.css`
- Test: browser validation at 390×844 and 1280×720

- [ ] **Step 1: Add a mobile game-selection flow**

Append to `GameSelectPage/index.css`:

```css
@media (max-width: 48rem) {
  .game-select-page {
    width: 100%;
    min-height: 100svh;
    height: auto;
    overflow-x: hidden;
    overflow-y: auto;
    padding: max(1rem, env(safe-area-inset-top)) 1rem
      max(1.5rem, env(safe-area-inset-bottom));
  }

  .game-entry-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    width: 100%;
  }

  .game-entry-card {
    width: 100%;
    height: auto;
    min-height: 18rem;
    padding: 1rem;
  }

  .game-entry-main {
    flex-basis: 12rem;
  }

  .game-entry-actions button,
  .game-player-save,
  .game-recent-list button {
    min-height: 2.75rem;
  }
}
```

Preserve all desktop declarations; this block uses the current page selectors.

- [ ] **Step 2: Make the Werewolf mode dialog a safe-area bottom sheet**

Append the v2-scoped mobile block to `WerewolfGameV2/index.css`; the shared
dialog stylesheet stays unchanged:

```css
@media (max-width: 48rem) {
  .werewolf-shell--v2 .werewolf-mode-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .werewolf-shell--v2 .werewolf-mode-dialog {
    width: 100%;
    max-height: min(88dvh, 48rem);
    overflow-y: auto;
    border-radius: 1.25rem 1.25rem 0 0;
    padding: 1.25rem 1rem
      max(1.25rem, env(safe-area-inset-bottom));
  }

  .werewolf-shell--v2 .werewolf-mode-grid,
  .werewolf-shell--v2 .werewolf-player-grid,
  .werewolf-shell--v2 .werewolf-view-mode-switch {
    grid-template-columns: minmax(0, 1fr);
  }

  .werewolf-shell--v2 .werewolf-mode-dialog button,
  .werewolf-shell--v2 .werewolf-mode-dialog input,
  .werewolf-shell--v2 .werewolf-mode-dialog select {
    min-height: 2.75rem;
  }
}
```

- [ ] **Step 3: Remove the v2 stage minimum width on phones**

Append to `WerewolfArenaV2/index.css`:

```css
@media (max-width: 48rem) {
  .werewolf-v2-arena {
    position: relative;
    min-width: 0;
    min-height: 52rem;
    overflow: visible;
  }
}
```

- [ ] **Step 4: Reflow twelve seats into adjacent two-by-three rosters**

Append to `PerspectiveShared/index.css`, using the exact existing roster and seat class names:

```css
@media (max-width: 48rem) {
  .perspective-header {
    top: 0.75rem;
    width: calc(100% - 6rem);
  }

  .perspective-mode-label {
    top: 0.75rem;
    left: 0.75rem;
  }

  .perspective-roster {
    position: absolute;
    top: 6rem;
    width: calc(50% - 0.75rem);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(3, 5rem);
    gap: 0.5rem 0.375rem;
    transform: none;
  }

  .perspective-roster--left {
    left: 0.5rem;
  }

  .perspective-roster--right {
    right: 0.5rem;
  }

  .perspective-seat {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    width: 100%;
    min-width: 0;
    padding: 0.375rem 0.25rem;
    text-align: center;
  }

  .perspective-seat__avatar {
    width: 2.75rem;
    height: 2.75rem;
  }

  .perspective-seat > b {
    position: absolute;
    top: 0;
    left: 0.125rem;
    width: 1.5rem;
    height: 1.5rem;
  }

  .perspective-seat > span {
    width: 100%;
  }

  .perspective-seat > span strong,
  .perspective-seat > span small {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .perspective-seat > i {
    top: 2.25rem;
    right: 0;
    left: auto;
    max-width: 4rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .perspective-roster .perspective-seat {
    transform: none;
  }

  .interaction-stage {
    position: relative;
    inset: auto;
    width: calc(100% - 1rem);
    min-height: 14rem;
    margin: 23rem 0.5rem 0;
  }
}
```

The final margin is adjusted against the actual header and seat heights so the interaction stage begins below both three-row rosters without overlap.

- [ ] **Step 5: Keep speech and controls visible above the phone safe area**

Append to `WerewolfBottomSpeechBar/index.css`:

```css
@media (max-width: 48rem) {
  .werewolf-v2-bottom-speech {
    left: 0.75rem;
    right: 0.75rem;
    bottom: calc(4.75rem + env(safe-area-inset-bottom));
    width: auto;
    grid-template-columns: minmax(0, 1fr);
    padding: 0.75rem;
    transform: none;
  }
}
```

Append to `WerewolfGameV2/index.css` using the exact existing control class names:

```css
@media (max-width: 48rem) {
  .game-shell.werewolf-shell--v2 {
    min-width: 0;
    min-height: 100svh;
    height: auto;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .werewolf-shell--v2 .werewolf-controls {
    position: fixed;
    top: auto;
    left: 0.75rem;
    right: 0.75rem;
    bottom: max(0.5rem, env(safe-area-inset-bottom));
    width: auto;
    min-height: 3.75rem;
    height: auto;
    overflow-x: auto;
    z-index: 40;
  }

  .werewolf-shell--v2 .werewolf-controls button {
    min-height: 2.75rem;
    min-width: 2.75rem;
  }
}
```

- [ ] **Step 6: Build the client before browser inspection**

Run:

```powershell
pnpm.cmd --filter @ai-presenter/client run typecheck
pnpm.cmd --filter @ai-presenter/client run build
```

Expected: PASS with no PostCSS parse errors and no TypeScript errors.

- [ ] **Step 7: Validate desktop and mobile layouts in a real browser**

Start the existing development runtime using a free server port if `3001` is occupied. Open:

- Game selection at 1280×720 and 390×844.
- Werewolf v2 mode dialog at 1280×720 and 390×844.
- Werewolf v2 live/replay stage at 1280×720 and 390×844.

At 390×844 verify:

- No horizontal page scroll.
- Game cards form one vertical column.
- Mode dialog is a bottom sheet and every actionable control is at least 2.75rem high.
- Twelve seats are visible as two adjacent 2×3 rosters.
- Interaction stage starts below the rosters.
- Speech content does not sit under the fixed controls.
- Bottom controls clear `env(safe-area-inset-bottom)`.

At 1280×720 verify that desktop placement, stage artwork, and seat composition are unchanged.

- [ ] **Step 8: Commit the mobile slice**

```powershell
git add packages/client/src/pages/GameSelectPage/index.css packages/client/src/features/werewolf-v2/WerewolfGameV2/index.css packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.css packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.css packages/client/src/features/werewolf-v2/components/WerewolfBottomSpeechBar/index.css
git commit -m "fix: reflow game stages on mobile"
```

---

## Task 6: Synchronize Documentation and Run the Full P0 Gate

**Files:**

- Modify: `docs/project-server.md`
- Modify: `docs/project-client.md`
- Modify: `docs/project-shared.md`
- Verify: all files changed by Tasks 1–5

- [ ] **Step 1: Update server documentation**

Document in `docs/project-server.md`:

- `GET /api/toc/health` is liveness-only and returns `{ ok, service }`.
- `GET /api/toc/bootstrap` returns only public player presentation fields.
- Public game-type validation comes from the registered `GameDefinition`.
- Unit tests assign disposable SQLite and JSON database paths before server modules load.

- [ ] **Step 2: Update client documentation**

Document in `docs/project-client.md`:

- Player bootstrap uses `/api/toc/bootstrap`.
- Recent-game sections distinguish loading, failure, empty, and ready states.
- Mobile game selection uses a one-column scrolling layout.
- Werewolf v2 uses a bottom-sheet mode dialog, two adjacent 2×3 rosters, safe-area controls, and a speech layer above controls.
- Mobile CSS deliberately uses a `48rem` media threshold and non-pixel units because the existing px-to-vw plugin converts pixel values.

- [ ] **Step 3: Update shared/workflow contract documentation**

Document in `docs/project-shared.md`:

- `metadata.session.playerSelection` is the single public selection constraint for all three registered games.
- Debate is `8–12`, Werewolf is exactly `12`, and Undercover is exactly `6`.
- No shared protocol or database schema changed in this P0 slice.

- [ ] **Step 4: Run the full unit suite without touching repository data**

Run:

```powershell
$databaseFile = Resolve-Path packages/data/ai-presenter.sqlite
$beforeWrite = (Get-Item -LiteralPath $databaseFile).LastWriteTimeUtc
pnpm.cmd run test:unit
if ($LASTEXITCODE -ne 0) { throw "unit tests failed" }
$afterWrite = (Get-Item -LiteralPath $databaseFile).LastWriteTimeUtc
if ($afterWrite -ne $beforeWrite) {
  throw "unit tests modified packages/data/ai-presenter.sqlite"
}
```

Expected: PASS and identical pre/post repository database timestamps.

- [ ] **Step 5: Run repository checks and production build**

Run:

```powershell
pnpm.cmd run check
pnpm.cmd --filter @ai-presenter/client run build
```

Expected: PASS with no type, unit-test, or build failures.

- [ ] **Step 6: Review the diff for scope and secret-safety**

Run:

```powershell
git status --short
git diff --check
git diff HEAD~5 -- packages/server/routes/gameRoutes.ts packages/server/modules/werewolf/views/viewPolicy.ts packages/client/src docs tests/unit
```

Confirm:

- No user-authored Undercover files were changed.
- No schema, migration, public WebSocket event, or secret payload changed.
- No provider/model/key readiness fields remain in public bootstrap responses.
- No `god` fallback remains in the unresolved player-view branch.
- No mobile media query in this slice depends on a pixel threshold.

- [ ] **Step 7: Commit documentation**

```powershell
git add docs/project-server.md docs/project-client.md docs/project-shared.md
git commit -m "docs: record p0 reliability boundaries"
```

- [ ] **Step 8: Record final verification evidence**

Capture:

- Focused test commands and pass counts.
- Full unit-suite result.
- `pnpm.cmd run check` result.
- Client production build result.
- Repository SQLite timestamp preservation.
- Browser viewport results for 1280×720 and 390×844.
- Any environmental limitation, especially if Docker or a browser runtime is unavailable.

Do not claim deployment readiness or Docker validation unless an image starts and its healthcheck passes.
