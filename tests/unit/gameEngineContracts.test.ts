import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentRuntime,
  ChannelSystem,
  EngineSkillRegistry,
  GameEngine,
} from '../../packages/server/modules/game-engine';
import type { GameDefinition } from '../../packages/shared/types/gameEngine';
import { MemoryMatchStateStore, createMatch, createWindow } from './gameEngineTestUtils';

function createDefinition(overrides: Partial<GameDefinition> = {}): GameDefinition {
  return {
    gameType: 'test-game',
    version: '1.0.0',
    workflowId: 'test.workflow',
    actionSchemas: {},
    effectResolvers: [],
    channelPolicy: {},
    ...overrides,
  };
}

test('GameEngine rejects duplicate GameDefinition registration', () => {
  const engine = new GameEngine({ store: new MemoryMatchStateStore() });
  const definition = createDefinition();

  engine.registerDefinition(definition);

  assert.throws(() => engine.registerDefinition(definition), /already registered/);
});

test('ChannelSystem rejects missing channel and scoped events without scopeKey', () => {
  const channelSystem = new ChannelSystem();

  assert.equal(channelSystem.validateEvent({
    id: 'event-1',
    matchId: 'match-test',
    type: 'test',
    payload: {},
  }).ok, false);

  const scoped = channelSystem.validateEvent({
    id: 'event-2',
    matchId: 'match-test',
    type: 'test',
    payload: {},
    channel: 'scope',
  });

  assert.equal(scoped.ok, false);
  assert.equal(scoped.error?.code, 'SCOPE_KEY_REQUIRED');
});

test('ActionWindow outside action is rejected before effect creation', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({ gameType: 'test-game', workflowId: 'test.workflow' }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createDefinition({
    createEffectsFromAction: () => {
      throw new Error('createEffectsFromAction should not be called');
    },
  }));

  const result = await engine.submitAction({
    id: 'action-1',
    matchId: 'match-test',
    windowId: 'missing-window',
    actorId: 3,
    actionType: 'seer_check',
    payload: { target: 8 },
    idempotencyKey: 'action-1',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'ACTION_WINDOW_NOT_FOUND');
});

test('Invalid action schema output is rejected', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({ gameType: 'test-game', workflowId: 'test.workflow' }));
  store.addActionWindow(createWindow());
  const engine = new GameEngine({ store });
  engine.registerDefinition(createDefinition({
    actionSchemas: {
      seer_check: {
        safeParse: () => ({ success: false, error: 'invalid target' }),
      },
    },
  }));

  const result = await engine.submitAction({
    id: 'action-1',
    matchId: 'match-test',
    windowId: 'window-test',
    actorId: 3,
    actionType: 'seer_check',
    payload: { target: null },
    idempotencyKey: 'action-1',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'ACTION_SCHEMA_INVALID');
});

test('AgentRuntime rejects non-structured skill output', async () => {
  const registry = new EngineSkillRegistry([{
    id: 'seer_check',
    execute: () => 'not-structured',
  }]);
  const runtime = new AgentRuntime();

  await assert.rejects(
    () => runtime.runAction({
      matchId: 'match-test',
      actionWindow: createWindow(),
      actorId: 3,
      registry,
    }),
    /structured object/
  );
});
