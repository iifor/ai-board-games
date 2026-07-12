# Release Readiness Fixes Design

## Goal

Turn the current workspace into a production release candidate without changing confirmed product behavior, APIs, database schemas, or shared protocols.

## Scope

- Align debate workflow types and observability exports with their current consumers.
- Restore existing werewolf prompt and player-memory behavior required by the test suite.
- Remove or reconnect unreachable client selection code using the smallest behavior-preserving change.
- Make deployment stop before SSH when type checking, build, unit tests, workflow tests, or migration tests fail.

## Approach

Existing tests are the release contract. Fix production code rather than weakening assertions. Reuse current package scripts and Docker builder; add no dependencies or new runtime modules.

The deployment job must run these gates before configuring SSH:

1. `pnpm run check`
2. `pnpm run build`
3. `pnpm run test:unit`
4. `pnpm run test:workflow`
5. `pnpm run test:migration`
6. Docker image validation

## Boundaries

- No new feature behavior.
- No REST or WebSocket contract changes.
- No database migration or seed behavior changes.
- No production secrets are written to the repository.
- Existing dirty-worktree changes are preserved.

## Verification

The release candidate is ready only when all six gates pass from a cleanly defined commit set. The final handoff must list remaining uncommitted files and production environment prerequisites separately from code readiness.
