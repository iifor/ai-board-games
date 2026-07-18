import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GAME_ROUTE_VERSION, readStoredPlayerSelection } from '../../packages/client/src/hooks/useGameNavigation';
import * as clientRouter from '../../packages/client/src/router/clientRouter';

test('game selection defaults to v2 while v1 remains directly addressable', () => {
  assert.equal(DEFAULT_GAME_ROUTE_VERSION, 'v2');
  assert.equal(clientRouter.buildGamePath('werewolf', { version: DEFAULT_GAME_ROUTE_VERSION }), '/game/v2/werewolf');
  assert.equal(clientRouter.buildGamePath('werewolf', { version: 'v1' }), '/games/werewolf');
  assert.equal(clientRouter.buildGamePath('undercover', { version: 'v2' }), '/game/v2/undercover');
});

test('undercover routes are parsed as game routes', () => {
  assert.equal(typeof clientRouter.parseClientRoute, 'function');
  assert.deepEqual(
    clientRouter.parseClientRoute({ pathname: '/game/v2/undercover', search: '?gameId=history-1' }),
    {
      name: 'game',
      gameKey: 'undercover',
      version: 'v2',
      searchParams: new URLSearchParams('gameId=history-1')
    }
  );
});

test('stored Undercover selection is consumed without changing the selected ids', (t) => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: () => JSON.stringify({ undercover: [9, 4, 7, 2, 8, 1] })
      }
    }
  });
  t.after(() => Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow }));

  assert.deepEqual(readStoredPlayerSelection('undercover'), [9, 4, 7, 2, 8, 1]);
});
