# Backend Boundary Hardening Design

## Goal

Complete the smallest backend reliability slice identified by the architecture
audit:

1. reject malformed or oversized public WebSocket commands before business
   logic;
2. use registered `GameDefinition` metadata for public game-type and player
   selection validation;
3. close WebSocket sessions and flush observability before process exit.

The service remains a single-process Express/WebSocket/SQLite application.

## Existing decision reused

Registered-game validation is already approved in
`2026-07-24-p0-reliability-and-mobile-design.md`. This design reuses that
decision and implements only its server route slice:

- `getGameEngine().getDefinition()` is the game-type source of truth;
- `metadata.session.playerSelection` owns public selection bounds;
- debate remains 8–12 players, Werewolf remains exactly 12 saved players, and
  Undercover remains exactly 6 players;
- unknown game types return the existing HTTP 400 validation response.

No second registry, game catalog, or generic game DSL is introduced.

## Approaches considered

### A. Focused boundary changes in existing modules — selected

Keep protocol parsing in `game-socket/session.ts`, socket ownership in
`game-socket/service.ts`, route validation in `gameRoutes.ts`, and shutdown
ordering in `lifecycle.ts`. Reuse Zod and existing tests.

This touches the fewest production files while putting each guard at the
existing trust or lifecycle boundary.

### B. Add protocol and lifecycle framework modules

Create a protocol package, connection manager, cleanup registry, and generic
resource hooks. This would make future extension more configurable but adds
abstractions with only one current implementation.

Rejected as unnecessary.

### C. Split and rewrite `game-socket/service.ts`

Move message handlers, sessions, playback, and runners behind new service
classes before fixing the boundaries.

Rejected because file size is not the reported failure and the rewrite would
increase regression risk.

## WebSocket input contract

`parseMessage()` will parse JSON and validate one of the existing client
commands:

- `start`;
- `ack`;
- `control`;
- `randomize-teams`.

Validation uses a Zod discriminated union. It preserves currently supported
optional `start` fields and validates only their safe outer shapes:

- IDs are strings or finite positive numbers as currently accepted;
- `playerIds` is a bounded array;
- `ackId` is a string or finite number;
- `control.action` is `pause`, `resume`, or `skip-phase`;
- object-shaped configuration fields remain records because their game-specific
  validation stays in the relevant runner.

Unknown commands, malformed JSON, missing required fields, and invalid field
types return:

```json
{
  "type": "error",
  "code": "INVALID_MESSAGE",
  "message": "无效的游戏指令。"
}
```

They do not enter session guards, runners, replay, debug mode, or ACK handling.

`WebSocketServer` will set an explicit `maxPayload` of 64 KiB. Current command
payloads are small JSON control messages; generated audio and playback events
travel server-to-client and do not require a larger inbound limit.

No public outbound event or ACK envelope changes.

## Registered game validation

`gameRoutes.ts` will replace its local `debate/werewolf` allowlist with a small
lookup through the existing engine registry.

Player selection validation will read
`definition.metadata.session.playerSelection`. Debate and Werewolf definitions
will declare the already-enforced bounds that Undercover already declares.
Werewolf runtime mode-specific player counts remain in the WebSocket start
path; this route continues to validate only the saved public selection
contract.

The legacy `games/utils.ts` helper will be deleted only if it has no current
callers. Otherwise it will delegate to the registry without silently mapping
unknown values to Werewolf.

No database schema, stored `game_type`, REST path, or response envelope changes.

## Shutdown contract

`attachGameSocket()` will return a minimal async `close()` function rather than
expose a new connection-manager class.

On shutdown:

1. stop accepting new WebSocket connections;
2. close existing client sockets so pending ACK waits reject through the
   existing session cancellation path;
3. close the HTTP server;
4. flush and shut down the current OpenTelemetry provider;
5. close the cached SQLite connection when one exists;
6. exit with code 0.

Any cleanup failure produces exit code 1. The existing 10-second timer remains
the final process-exit ceiling and repeated signals remain idempotent.

Workflow maintenance uses an unreferenced timer and therefore does not keep the
process alive. Adding a generic maintenance registry is outside this slice.

## File responsibilities

### New files

- `tests/unit/tocPublicRoutes.test.ts`
  - Covers registered game types, Undercover selection, and unknown-type
    rejection through the real Express app.

### Modified server files

- `packages/server/modules/game-socket/session.ts`
  - Owns inbound command schema and typed parsing.
- `packages/server/modules/game-socket/service.ts`
  - Applies the payload ceiling, reports invalid commands, and returns socket
    cleanup.
- `packages/server/routes/gameRoutes.ts`
  - Resolves public game types and selection metadata through the registry.
- `packages/server/modules/debate/definition.ts`
  - Declares the existing 8–12 selection constraint.
- `packages/server/modules/werewolf/definition.ts`
  - Declares the existing 12-player saved-selection constraint.
- `packages/server/lifecycle.ts`
  - Orders asynchronous cleanup and preserves timeout/idempotency behavior.
- `packages/server/index.ts`
  - Supplies WebSocket, observability, and database cleanup functions.
- `packages/server/db/index.ts`
  - Exposes idempotent cached-connection close/reset.
- `packages/server/modules/observability/tracer.ts`
  - Exposes one provider shutdown function rather than its internal provider.

### Modified tests and documentation

- `tests/unit/gameSocketSession.test.ts`
  - Covers valid and invalid inbound command parsing.
- `tests/unit/serverLifecycle.test.ts`
  - Covers cleanup order, cleanup failure, timeout, and repeated signals.
- `tests/unit/runUnitTests.cjs`
  - Registers the new public route test.
- `docs/project-server.md`
  - Documents registry-owned public validation and shutdown resources.
- `docs/project-workflow.md`
  - Documents WebSocket command rejection and payload limit.
- `docs/project-shared.md`
  - Documents definition-owned player selection bounds.

## Error handling

- WebSocket validation errors are client-visible and do not log stack traces.
- WebSocket runner failures continue using the current error path.
- Shutdown cleanup failures are logged once and return exit code 1.
- Database close is idempotent and resets the cached connection for tests.
- No cleanup path deletes match, playback, trace, or business data.

## Testing

Implementation follows red-green TDD:

1. extend `gameSocketSession.test.ts` and observe malformed commands fail;
2. add `tocPublicRoutes.test.ts` and observe Undercover/unknown-type assertions
   fail;
3. extend `serverLifecycle.test.ts` and observe cleanup-order assertions fail;
4. implement only enough production code for each focused test;
5. run the focused tests, full unit suite, server type check, repository check,
   and production server build.

The database schema and public protocol versions are unchanged, so migration
tests are not required for this slice.

## Explicitly skipped

- microservices, Redis, Kafka, PostgreSQL, distributed draining;
- a new protocol framework or connection-manager class;
- a universal game DSL;
- runner rewrites;
- broad splitting of `service.ts` or `replay.ts`;
- frontend and mobile work from the separate P0 plan.
