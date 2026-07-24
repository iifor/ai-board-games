# P0 Reliability and Mobile Design

## Goal

Stabilize the three public v2 games—debate, werewolf, and undercover—by isolating
tests from development data, removing hard-coded public route branches, reducing
public configuration exposure, failing closed at the werewolf player-view
boundary, and making the public selection and werewolf v2 surfaces usable on
mobile.

## Product boundary

This batch covers only the approved P0 work:

1. Unit-test database isolation.
2. Registered-game validation for public selection and recent-game routes.
3. Minimal health response plus a C-side bootstrap response.
4. Fail-closed werewolf player-view projection.
5. Responsive mobile layouts for game selection and werewolf v2.
6. Focused regression tests and contract documentation.

This batch does not:

- delete, compact, or migrate existing business data;
- remove legacy debate or werewolf runners;
- redesign workflow event storage or outbox retention;
- add a fourth game, a universal game DSL, or a new UI framework;
- rewrite the existing uncommitted Undercover client work.

## Architecture decisions

### 1. Unit tests use a unique temporary database

`tests/unit/runUnitTests.cjs` will create one unique directory under
`os.tmpdir()` before loading any TypeScript test or server module. It will set
both `DATABASE_PATH` and `JSON_DATABASE_PATH` to files in that directory.

`packages/server/db/index.ts` will expose a small internal `closeDb()` function.
The unit runner will close the cached connection and synchronously remove its
temporary directory during process shutdown. The development database path will
never be opened by the unit suite.

One focused unit test will assert that the active database and fallback paths
are outside the repository data directory and inside the runner-created
temporary directory.

No database table or migration changes are required.

### 2. Public game validation comes from registered definitions

`gameRoutes.ts` will stop maintaining its own debate/werewolf allowlist.
It will resolve the requested type through `getGameEngine().getDefinition()`.
An unregistered type will produce a typed HTTP 400 validation error instead of
an internal HTTP 500.

The existing `GameSessionMetadata.playerSelection` contract will be the single
source for selection bounds:

- debate: 8–12 players;
- werewolf: exactly 12 saved players;
- undercover: exactly 6 players.

The debate and werewolf definitions will receive the same metadata already used
by the Undercover definition. The existing game selection UI and server route
will therefore validate against one registered contract without adding a new
registry or configuration layer.

The public recent-games route will accept all registered games, including
`undercover`.

### 3. Health and C-side bootstrap are separate contracts

`GET /api/toc/health` will return only:

```json
{
  "ok": true,
  "service": "ai-presenter-api"
}
```

`GET /api/toc/bootstrap` will return the enabled public player fields consumed
by the C-side:

- id;
- nickname;
- avatar and avatar URL;
- sex;
- personality;
- voice package ID.

Provider names, model names, base URLs, API-key environment names, and provider
readiness topology will not be returned to unauthenticated clients.

The client service will use `fetchAiBootstrap()` for player loading. Debate,
werewolf, and the game selection page will continue to reuse this service.
Express will disable `X-Powered-By`.

### 4. Werewolf player projection fails closed

Creating a new player-view game may continue choosing one random assigned AI
player when no explicit player ID is supplied; this is the current documented
“randomly embody one player” product behavior.

Projection and replay are different trust boundaries. When persisted or
overridden player-view data contains no valid viewer, `createProjectionContext`
will raise `VISIBILITY_POLICY_FAILED`. It will never return god mode.

Focused tests will prove:

- a valid player sees only the authorized projection;
- a missing or invalid stored viewer cannot receive god-view data;
- god mode remains unchanged.

No REST or WebSocket envelope changes are required.

### 5. Mobile uses real reflow, not desktop scaling

The current CSS build converts every `px` token to viewport-width units using a
1920px design width. Existing `@media (max-width: ...px)` rules are converted as
well, so their mobile breakpoints do not activate at phone widths.

This batch will not replace the shared conversion plugin. The smaller, safer
fix is to use `rem` breakpoints and `rem`/percentage/safe-area units inside the
new mobile rules, which the existing plugin leaves unchanged.

At `max-width: 48rem`:

- the game selection page becomes a vertically scrollable single-column list;
- cards use content height and 44px-equivalent minimum controls;
- player selection and recent-game content remain independently readable;
- the werewolf setup dialog becomes a full-width bottom sheet;
- mode cards and player choices become one-column touch targets;
- the v2 stage presents the twelve seats as two adjacent 2×3 rosters;
- the interaction stage moves below the rosters;
- playback controls remain fixed above the bottom safe area;
- the speech bar sits above the controls and uses a single-column layout.

The desktop layout and visual identity remain unchanged.

### 6. Recent-game loading errors remain visible

`GameSelectPage` will track `loading`, `ready`, and `error` status per game.
Network or API failures will no longer be rendered as “暂无历史对局”.

This is local component state; no new store or hook is needed.

## File responsibilities

### New files

- `tests/unit/testEnvironmentIsolation.test.ts`
  - Proves the unit runner uses temporary database paths.
- `tests/unit/tocPublicRoutes.test.ts`
  - Starts the real Express app on an ephemeral local port and verifies health,
    bootstrap, Undercover recent games, registered selection validation, and
    unknown-type errors.

### Modified server files

- `packages/server/db/index.ts`
  - Close/reset the cached database connection for test shutdown.
- `packages/server/routes/gameRoutes.ts`
  - Split health/bootstrap and use registered game metadata.
- `packages/server/modules/debate/definition.ts`
  - Declare the existing 8–12 player selection contract.
- `packages/server/modules/werewolf/definition.ts`
  - Declare the existing 12-player saved-selection contract.
- `packages/server/modules/werewolf/views/viewPolicy.ts`
  - Reject invalid player-view projection instead of revealing god view.
- `packages/server/app.ts`
  - Disable the Express technology header.

### Modified client files

- `packages/client/src/services/gameService.ts`
  - Read public players from `/api/toc/bootstrap`.
- `packages/client/src/features/debate/DebateGame/index.tsx`
  - Consume the renamed bootstrap service.
- `packages/client/src/pages/GameSelectPage/index.tsx`
  - Display per-game loading/error/empty history states.
- `packages/client/src/pages/GameSelectPage/index.css`
  - Add the single-column mobile layout.
- `packages/client/src/features/werewolf/components/WerewolfModeDialog/index.css`
  - Add shared mobile bottom-sheet and touch-target rules.
- `packages/client/src/features/werewolf-v2/WerewolfGameV2/index.css`
  - Position mobile controls and v2 dialog overrides.
- `packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.css`
  - Remove the desktop minimum-width assumption on mobile.
- `packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.css`
  - Reflow rosters, header, and interaction stage for portrait screens.
- `packages/client/src/features/werewolf-v2/components/WerewolfBottomSpeechBar/index.css`
  - Keep speech readable above mobile controls.

### Modified tests and docs

- `tests/unit/runUnitTests.cjs`
  - Create, expose, close, and clean the temporary test database.
- `tests/unit/werewolfChannelGuard.test.ts`
  - Add fail-closed projection checks to the existing visibility suite.
- `docs/project-server.md`
  - Document health/bootstrap and test database isolation.
- `docs/project-client.md`
  - Document explicit history errors and mobile v2 behavior.
- `docs/project-shared.md`
  - Document definition-owned player selection and isolated test storage.

## Error handling

- Unknown game types return HTTP 400 with the existing validation error shape.
- Invalid player counts return HTTP 400 with the definition-provided message.
- Bootstrap failure remains a visible C-side load error.
- Recent-game failure is displayed per game and is never treated as an empty
  successful result.
- Invalid player-view projection aborts before any private or god-view payload
  is produced.
- Temporary database cleanup is best-effort after the connection is closed;
  cleanup failure reports a warning without hiding test failures.

## Verification

The implementation is accepted only when all of the following pass:

1. The focused unit runner isolation test.
2. Public route integration tests using an ephemeral port and temporary DB.
3. Werewolf fail-closed visibility tests.
4. `pnpm.cmd run test:unit`.
5. `pnpm.cmd run check`.
6. `pnpm.cmd run build:client`.
7. Live browser verification at 1280×720 and 390×844 for:
   - `/games`;
   - `/game/v2/werewolf`;
   - the werewolf setup dialog.
8. A before/after modification-time check proving the repository development
   database was not touched by the unit suite.

Docker image startup and data-retention cleanup remain separate work because the
local Docker daemon is unavailable and destructive data operations require a
backup and an explicit retention decision.
