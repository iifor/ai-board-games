import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AgentRuntime,
  ChannelSystem,
  EngineSkillRegistry,
  GameEngine,
  checkEffectLifecycleInvariant,
  checkEventChannelInvariant,
} from '../../packages/server/modules/game-engine';
import type { GameDefinition } from '../../packages/shared/types/gameEngine';
import type { WorkflowRuntime } from '../../packages/server/modules/game-engine/workflow/workflowRuntime';
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

test('debate engine runner seeds matches with the configured initial state', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'packages/server/modules/debate-runner.ts'),
    'utf8',
  );

  assert.match(source, /initialState:\s*await createInitialDebateState\(config\)/);
});

test('GameEngine rejects tick for terminal matches before workflow runtime is called', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    gameType: 'test-game',
    workflowId: 'test.workflow',
    status: 'completed',
  }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createDefinition());

  await assert.rejects(engine.tick('match-test'), /completed/);
});

test('GameEngine delegates run-until-blocked to its workflow runtime', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({ gameType: 'test-game', workflowId: 'test.workflow', status: 'running' }));
  let received: unknown = null;
  const workflowRuntime = {
    runUntilBlocked: async (matchId: string, options: Record<string, unknown>) => {
      received = { matchId, options };
      return { processed: 2, match: createMatch({ status: 'completed' }) };
    },
  } as unknown as WorkflowRuntime;
  const engine = new GameEngine({ store, workflowRuntime });

  const result = await engine.runUntilBlocked('match-test', { batchSize: 2 });

  assert.deepEqual(received, { matchId: 'match-test', options: { batchSize: 2 } });
  assert.equal(result.match?.status, 'completed');
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

test('Invariant checker reports missing channel and missing scopeKey', () => {
  const issues = checkEventChannelInvariant([{
    id: 'event-1',
    matchId: 'match-test',
    type: 'test',
    payload: {},
  }]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'CHANNEL_REQUIRED');

  const scopedIssues = checkEventChannelInvariant([{
    id: 'event-2',
    matchId: 'match-test',
    type: 'test',
    payload: {},
    channel: 'scope',
  }]);
  assert.equal(scopedIssues.length, 1);
  assert.equal(scopedIssues[0].code, 'SCOPE_KEY_REQUIRED');
});

test('Invariant checker validates effect lifecycle state', () => {
  const proposedIssues = checkEffectLifecycleInvariant({
    id: 'effect-proposed',
    matchId: 'match-test',
    effectType: 'inspect',
    status: 'proposed',
    payload: {},
    appliedEventSeq: 1,
  });
  assert.equal(proposedIssues.length, 1);
  assert.equal(proposedIssues[0].code, 'EFFECT_SEQ_WITHOUT_APPLY');

  const appliedIssues = checkEffectLifecycleInvariant({
    id: 'effect-applied',
    matchId: 'match-test',
    effectType: 'inspect',
    status: 'applied',
    payload: {},
  });
  assert.equal(appliedIssues.length, 1);
  assert.equal(appliedIssues[0].code, 'EFFECT_APPLIED_WITHOUT_SEQ');
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

test('Memory store keeps event idempotency keys unique', async () => {
  const store = new MemoryMatchStateStore();
  const event = {
    id: 'event-1',
    matchId: 'match-test',
    type: 'test-event',
    payload: {},
    channel: 'public' as const,
    idempotencyKey: 'same-key',
  };

  await store.appendEvents([event]);
  await store.appendEvents([{ ...event, id: 'event-2' }]);

  assert.equal((await store.listEvents('match-test')).length, 1);
});

test('GameEngine debug state aggregates match, windows, effects, events, definitions and invariants', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({ gameType: 'test-game', workflowId: 'test.workflow' }));
  store.addActionWindow(createWindow({ actionType: 'seer_check' }));
  await store.enqueueEffect({
    id: 'effect-1',
    matchId: 'match-test',
    effectType: 'inspect',
    status: 'proposed',
    payload: {},
  });
  await store.appendEvents([{
    id: 'event-1',
    matchId: 'match-test',
    type: 'test-event',
    payload: {},
    channel: 'public',
    idempotencyKey: 'event-1',
  }]);

  const engine = new GameEngine({ store });
  engine.registerDefinition(createDefinition());
  const debug = await engine.getDebugState('match-test');

  assert.equal(debug.match?.id, 'match-test');
  assert.equal(debug.actionWindows.length, 1);
  assert.equal(debug.effects.length, 1);
  assert.equal(debug.events.length, 1);
  assert.equal(debug.definitions.length, 1);
  assert.deepEqual(debug.invariants, []);
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
