import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelSystem, GameEngine } from '../../packages/server/modules/game-engine';
import { createWerewolfGameDefinition } from '../../packages/server/modules/werewolf/definition';
import { MemoryMatchStateStore, createMatch, createWindow } from './gameEngineTestUtils';

test('Werewolf seer_check action creates inspect effect and scoped seer event', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch());
  store.addActionWindow(createWindow({
    id: 'seer-window',
    actionType: 'seer_check',
    actorIds: [3],
  }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  const submit = await engine.submitAction({
    id: 'action-seer',
    matchId: 'match-test',
    windowId: 'seer-window',
    actorId: 3,
    actionType: 'seer_check',
    payload: { target: '8', result: 'wolves' },
    idempotencyKey: 'action-seer',
  });

  assert.equal(submit.ok, true);
  assert.equal(submit.data?.effects.length, 1);
  assert.equal(submit.data?.effects[0].effectType, 'inspect');
  assert.equal(submit.data?.effects[0].payload.target, 8);

  const resolved = await engine.resolveEffects('match-test');
  assert.equal(resolved.ok, true);

  const events = store.listEvents('match-test');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'seer_checked');
  assert.equal(events[0].channel, 'scope');
  assert.equal(events[0].scopeKey, 'seer');

  const channelSystem = new ChannelSystem(createWerewolfGameDefinition().channelPolicy);
  assert.equal(channelSystem.canAccess(events[0], { type: 'player', roles: ['seer'] }), true);
  assert.equal(channelSystem.canAccess(events[0], { type: 'audience' }), false);
});

test('Werewolf guard_protect action creates private protect event, not public reveal', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch());
  store.addActionWindow(createWindow({
    id: 'guard-window',
    actionType: 'guard_protect',
    actorIds: [4],
    targetIds: [8],
  }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  const submit = await engine.submitAction({
    id: 'action-guard',
    matchId: 'match-test',
    windowId: 'guard-window',
    actorId: 4,
    actionType: 'guard_protect',
    payload: { target: 8 },
    idempotencyKey: 'action-guard',
  });

  assert.equal(submit.ok, true);
  assert.equal(submit.data?.effects[0].effectType, 'protect');

  await engine.resolveEffects('match-test');
  const event = store.listEvents('match-test')[0];
  assert.equal(event.type, 'guard_protected');
  assert.equal(event.channel, 'scope');
  assert.equal(event.scopeKey, 'guard');

  const channelSystem = new ChannelSystem(createWerewolfGameDefinition().channelPolicy);
  assert.equal(channelSystem.canAccess(event, { type: 'audience' }), false);
  assert.equal(channelSystem.canAccess(event, { type: 'player', roles: ['guard'] }), true);
});

test('Repeated action idempotency does not create duplicate effects or events', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch());
  store.addActionWindow(createWindow({ id: 'seer-window' }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());
  const action = {
    id: 'action-seer',
    matchId: 'match-test',
    windowId: 'seer-window',
    actorId: 3,
    actionType: 'seer_check',
    payload: { target: 8 },
    idempotencyKey: 'action-seer',
  };

  await engine.submitAction(action);
  await engine.submitAction(action);

  assert.equal(store.listEffects('match-test').length, 1);

  await engine.resolveEffects('match-test');
  await engine.resolveEffects('match-test');

  assert.equal(store.listEvents('match-test').length, 1);
});
