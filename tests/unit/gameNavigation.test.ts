import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GAME_ROUTE_VERSION } from '../../packages/client/src/hooks/useGameNavigation';
import { buildGamePath } from '../../packages/client/src/router/clientRouter';

test('game selection defaults to v2 while v1 remains directly addressable', () => {
  assert.equal(DEFAULT_GAME_ROUTE_VERSION, 'v2');
  assert.equal(buildGamePath('werewolf', { version: DEFAULT_GAME_ROUTE_VERSION }), '/game/v2/werewolf');
  assert.equal(buildGamePath('werewolf', { version: 'v1' }), '/games/werewolf');
});
