import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelSystem, GameEngine } from '../../packages/server/modules/game-engine';
import { createWerewolfGameDefinition } from '../../packages/server/modules/werewolf/definition';
import { MemoryMatchStateStore, createMatch, createWindow } from './gameEngineTestUtils';

test('Werewolf wolf_vote action creates private kill effect and wolf target projection', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      players: [
        { id: 1, role: 'werewolf', faction: 'wolves' },
        { id: 2, role: 'werewolf', faction: 'wolves' },
        { id: 3, role: 'werewolf', faction: 'wolves' },
        { id: 8, roleLabel: '预言家' },
        { id: 9, roleLabel: '村民' },
      ],
      rounds: [{ day: 1, phase: 'night', night: {} }],
    },
  }));
  store.addActionWindow(createWindow({
    id: 'wolf-vote-window',
    actionType: 'wolf_vote',
    actorIds: [1, 2, 3],
    targetIds: [8, 9],
    payload: { day: 1 },
  }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  const first = await engine.submitAction({
    id: 'action-wolf-vote-1',
    matchId: 'match-test',
    windowId: 'wolf-vote-window',
    actorId: 1,
    actionType: 'wolf_vote',
    payload: { target: '8' },
    idempotencyKey: 'action-wolf-vote-1',
  });
  const second = await engine.submitAction({
    id: 'action-wolf-vote-2',
    matchId: 'match-test',
    windowId: 'wolf-vote-window',
    actorId: 2,
    actionType: 'wolf_vote',
    payload: { target: 8 },
    idempotencyKey: 'action-wolf-vote-2',
  });
  const third = await engine.submitAction({
    id: 'action-wolf-vote-3',
    matchId: 'match-test',
    windowId: 'wolf-vote-window',
    actorId: 3,
    actionType: 'wolf_vote',
    payload: { target: 9 },
    idempotencyKey: 'action-wolf-vote-3',
  });

  assert.equal(first.ok, true);
  assert.equal(first.data?.effects[0].effectType, 'kill');
  assert.equal(first.data?.effects[0].payload.actorId, 1);
  assert.equal(first.data?.effects[0].payload.day, 1);
  assert.equal(first.data?.effects[0].payload.target, 8);
  assert.equal(second.ok, true);
  assert.equal(third.ok, true);

  await engine.resolveEffects('match-test');
  const events = store.listEvents('match-test');
  assert.equal(events.length, 3);
  assert.equal(events[0].type, 'wolf_target_selected');
  assert.equal(events[0].channel, 'scope');
  assert.equal(events[0].scopeKey, 'wolves');

  const projected = store.loadMatch('match-test')?.state as {
    rounds?: Array<{
      night?: {
        wolfChoices?: Record<string, number>;
        wolfVoteTally?: Record<string, number>;
        wolfTarget?: number;
        wolfStrategy?: string;
      };
    }>;
  };
  const night = projected.rounds?.[0]?.night;
  assert.deepEqual(night?.wolfChoices, { 1: 8, 2: 8, 3: 9 });
  assert.deepEqual(night?.wolfVoteTally, { 8: 2, 9: 1 });
  assert.equal(night?.wolfTarget, 8);
  assert.match(night?.wolfStrategy || '', /狼队刀口分散/);

  const channelSystem = new ChannelSystem(createWerewolfGameDefinition().channelPolicy);
  assert.equal(channelSystem.canAccess(events[0], { type: 'audience' }), false);
  assert.equal(channelSystem.canAccess(events[0], { type: 'player', faction: 'wolves' }), true);
});

test('Werewolf wolf_kill action uses kill effect compatibility path', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      players: [{ id: 1, faction: 'wolves' }, { id: 8 }],
      rounds: [{ day: 1, phase: 'night', night: {} }],
    },
  }));
  store.addActionWindow(createWindow({
    id: 'wolf-kill-window',
    actionType: 'wolf_kill',
    actorIds: [1],
    targetIds: [8],
    payload: { day: 1 },
  }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  const submit = await engine.submitAction({
    id: 'action-wolf-kill',
    matchId: 'match-test',
    windowId: 'wolf-kill-window',
    actorId: 1,
    actionType: 'wolf_kill',
    payload: { target: 8 },
    idempotencyKey: 'action-wolf-kill',
  });

  assert.equal(submit.ok, true);
  assert.equal(submit.data?.effects.length, 1);
  assert.equal(submit.data?.effects[0].effectType, 'kill');

  await engine.resolveEffects('match-test');
  assert.equal(store.listEvents('match-test')[0].type, 'wolf_target_selected');
});

test('Werewolf wolf target action without valid target creates no effect', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch());
  store.addActionWindow(createWindow({
    id: 'wolf-vote-window',
    actionType: 'wolf_vote',
    actorIds: [1],
  }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  const submit = await engine.submitAction({
    id: 'action-wolf-vote-invalid',
    matchId: 'match-test',
    windowId: 'wolf-vote-window',
    actorId: 1,
    actionType: 'wolf_vote',
    payload: { target: null },
    idempotencyKey: 'action-wolf-vote-invalid',
  });

  assert.equal(submit.ok, true);
  assert.equal(submit.data?.effects.length, 0);
});

test('Werewolf seer_check action creates inspect effect and scoped seer event', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      players: [{ id: 3, role: 'seer', seerChecks: [] }, { id: 8, role: 'wolf' }],
      rounds: [],
    },
  }));
  store.addActionWindow(createWindow({
    id: 'seer-window',
    actionType: 'seer_check',
    actorIds: [3],
    payload: { day: 1 },
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
  assert.equal(events[0].payload.day, 1);

  const projected = store.loadMatch('match-test')?.state as {
    rounds?: Array<{ night?: { seerCheck?: { target?: number; result?: string } } }>;
    players?: Array<{ id: number; seerChecks?: Array<{ day?: number; target?: number; result?: string }> }>;
  };
  assert.equal(projected.rounds?.[0]?.night?.seerCheck?.target, 8);
  assert.equal(projected.rounds?.[0]?.night?.seerCheck?.result, 'wolves');
  assert.equal(projected.players?.find((player) => player.id === 3)?.seerChecks?.[0]?.target, 8);

  const channelSystem = new ChannelSystem(createWerewolfGameDefinition().channelPolicy);
  assert.equal(channelSystem.canAccess(events[0], { type: 'player', roles: ['seer'] }), true);
  assert.equal(channelSystem.canAccess(events[0], { type: 'audience' }), false);
});

test('Werewolf guard_protect action creates private protect event, not public reveal', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      players: [{ id: 4, role: 'guard' }, { id: 8 }],
      rounds: [],
    },
  }));
  store.addActionWindow(createWindow({
    id: 'guard-window',
    actionType: 'guard_protect',
    actorIds: [4],
    targetIds: [8],
    payload: { day: 1 },
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

  const projected = store.loadMatch('match-test')?.state as {
    rounds?: Array<{ night?: { guardTarget?: number } }>;
    players?: Array<{ id: number; lastGuardTarget?: number }>;
  };
  assert.equal(projected.rounds?.[0]?.night?.guardTarget, 8);
  assert.equal(projected.players?.find((player) => player.id === 4)?.lastGuardTarget, 8);

  const channelSystem = new ChannelSystem(createWerewolfGameDefinition().channelPolicy);
  assert.equal(channelSystem.canAccess(event, { type: 'audience' }), false);
  assert.equal(channelSystem.canAccess(event, { type: 'player', roles: ['guard'] }), true);
});

test('Werewolf guard_protect action accepts empty guard and creates no effect', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      players: [{ id: 4, role: 'guard' }, { id: 8 }],
      rounds: [{ day: 1, phase: 'night', night: {} }],
    },
  }));
  store.addActionWindow(createWindow({
    id: 'guard-empty-window',
    actionType: 'guard_protect',
    actorIds: [4],
    targetIds: [8],
    payload: { day: 1 },
  }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  const submit = await engine.submitAction({
    id: 'action-guard-empty',
    matchId: 'match-test',
    windowId: 'guard-empty-window',
    actorId: 4,
    actionType: 'guard_protect',
    payload: { target: null },
    idempotencyKey: 'action-guard-empty',
  });

  assert.equal(submit.ok, true);
  assert.equal(submit.data?.effects.length, 0);
  assert.equal(store.listEvents('match-test').length, 0);
});

test('Werewolf witch_save action creates private save event from current wolf target', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      players: [{ id: 4, role: 'witch', usedAntidote: false }, { id: 2 }],
      rounds: [{ day: 1, phase: 'night', night: { wolfTarget: 2 } }],
    },
  }));
  store.addActionWindow(createWindow({
    id: 'witch-save-window',
    actionType: 'witch_save',
    actorIds: [4],
    payload: { day: 1 },
  }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  const submit = await engine.submitAction({
    id: 'action-witch-save',
    matchId: 'match-test',
    windowId: 'witch-save-window',
    actorId: 4,
    actionType: 'witch_save',
    payload: { use: true },
    idempotencyKey: 'action-witch-save',
  });

  assert.equal(submit.ok, true);
  assert.equal(submit.data?.effects.length, 1);
  assert.equal(submit.data?.effects[0].effectType, 'save');
  assert.equal(submit.data?.effects[0].payload.target, 2);

  await engine.resolveEffects('match-test');
  const event = store.listEvents('match-test')[0];
  assert.equal(event.type, 'witch_saved');
  assert.equal(event.channel, 'scope');
  assert.equal(event.scopeKey, 'witch');

  const projected = store.loadMatch('match-test')?.state as {
    rounds?: Array<{ night?: { witchSave?: boolean; witchSaveTarget?: number } }>;
    players?: Array<{ id: number; usedAntidote?: boolean }>;
  };
  assert.equal(projected.rounds?.[0]?.night?.witchSave, true);
  assert.equal(projected.rounds?.[0]?.night?.witchSaveTarget, 2);
  assert.equal(projected.players?.find((player) => player.id === 4)?.usedAntidote, true);

  const channelSystem = new ChannelSystem(createWerewolfGameDefinition().channelPolicy);
  assert.equal(channelSystem.canAccess(event, { type: 'audience' }), false);
  assert.equal(channelSystem.canAccess(event, { type: 'player', roles: ['witch'] }), true);
});

test('Werewolf witch_poison action creates private poison event, not public reveal', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      players: [{ id: 4, role: 'witch', usedPoison: false }, { id: 5 }],
      rounds: [{ day: 1, phase: 'night', night: {} }],
    },
  }));
  store.addActionWindow(createWindow({
    id: 'witch-poison-window',
    actionType: 'witch_poison',
    actorIds: [4],
    targetIds: [5],
    payload: { day: 1 },
  }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  const submit = await engine.submitAction({
    id: 'action-witch-poison',
    matchId: 'match-test',
    windowId: 'witch-poison-window',
    actorId: 4,
    actionType: 'witch_poison',
    payload: { use: true, target: '5' },
    idempotencyKey: 'action-witch-poison',
  });

  assert.equal(submit.ok, true);
  assert.equal(submit.data?.effects.length, 1);
  assert.equal(submit.data?.effects[0].effectType, 'poison');
  assert.equal(submit.data?.effects[0].payload.target, 5);

  await engine.resolveEffects('match-test');
  const event = store.listEvents('match-test')[0];
  assert.equal(event.type, 'witch_poisoned');
  assert.equal(event.channel, 'scope');
  assert.equal(event.scopeKey, 'witch');

  const projected = store.loadMatch('match-test')?.state as {
    rounds?: Array<{ night?: { witchPoisonTarget?: number } }>;
    players?: Array<{ id: number; usedPoison?: boolean }>;
  };
  assert.equal(projected.rounds?.[0]?.night?.witchPoisonTarget, 5);
  assert.equal(projected.players?.find((player) => player.id === 4)?.usedPoison, true);

  const channelSystem = new ChannelSystem(createWerewolfGameDefinition().channelPolicy);
  assert.equal(channelSystem.canAccess(event, { type: 'audience' }), false);
  assert.equal(channelSystem.canAccess(event, { type: 'player', roles: ['witch'] }), true);
});

test('Werewolf witch no-op decisions do not create state-changing effects', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      rounds: [{ day: 1, phase: 'night', night: { wolfTarget: 2 } }],
    },
  }));
  store.addActionWindow(createWindow({
    id: 'witch-save-window',
    actionType: 'witch_save',
    actorIds: [4],
    payload: { day: 1 },
  }));
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  const submit = await engine.submitAction({
    id: 'action-witch-skip-save',
    matchId: 'match-test',
    windowId: 'witch-save-window',
    actorId: 4,
    actionType: 'witch_save',
    payload: { use: false },
    idempotencyKey: 'action-witch-skip-save',
  });

  assert.equal(submit.ok, true);
  assert.equal(submit.data?.effects.length, 0);
});

test('Werewolf night_resolution keeps guarded wolf target alive and hides private inputs', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      players: [{ id: 2, alive: true }, { id: 3, alive: true }],
      rounds: [{ day: 1, phase: 'night', night: { wolfTarget: 2, guardTarget: 2 } }],
    },
  }));
  store.enqueueEffect({
    id: 'effect-night-resolution-guarded',
    matchId: 'match-test',
    effectType: 'night_resolution',
    status: 'proposed',
    payload: { day: 1 },
  });
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  const resolved = await engine.resolveEffects('match-test');
  assert.equal(resolved.ok, true);

  const events = store.listEvents('match-test');
  const publicEvent = events.find((event) => event.type === 'night_resolved')!;
  const auditEvent = events.find((event) => event.type === 'night_resolution_audited')!;
  assert.deepEqual(publicEvent.payload.deaths, []);
  assert.equal(publicEvent.channel, 'public');
  assert.equal('input' in publicEvent.payload, false);
  assert.equal('effects' in publicEvent.payload, false);
  assert.equal('guardTarget' in publicEvent.payload, false);
  assert.equal(auditEvent.channel, 'system');

  const projected = store.loadMatch('match-test')?.state as {
    rounds?: Array<{ night?: { deaths?: Array<{ id: number; reason: string }> }; nightRevealed?: boolean; publicSummary?: string }>;
    players?: Array<{ id: number; alive?: boolean }>;
  };
  assert.deepEqual(projected.rounds?.[0]?.night?.deaths, []);
  assert.equal(projected.rounds?.[0]?.nightRevealed, true);
  assert.equal(projected.rounds?.[0]?.publicSummary, 'Night 1 ended with no deaths.');
  assert.equal(projected.players?.find((player) => player.id === 2)?.alive, true);

  const channelSystem = new ChannelSystem(createWerewolfGameDefinition().channelPolicy);
  assert.equal(channelSystem.canAccess(auditEvent, { type: 'audience' }), false);
  assert.equal(channelSystem.canAccess(auditEvent, { type: 'player', roles: ['witch'] }), false);
  assert.equal(channelSystem.canAccess(auditEvent, { type: 'system' }), true);
});

test('Werewolf night_resolution rejects poison when witch save is active', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      players: [{ id: 2, alive: true }, { id: 3, alive: true }],
      rounds: [{
        day: 1,
        phase: 'night',
        night: {
          wolfTarget: 2,
          witchSave: true,
          witchSaveTarget: 2,
          witchPoisonTarget: 3,
        },
      }],
    },
  }));
  store.enqueueEffect({
    id: 'effect-night-resolution-witch',
    matchId: 'match-test',
    effectType: 'night_resolution',
    status: 'proposed',
    payload: { day: 1 },
  });
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  await engine.resolveEffects('match-test');
  const publicEvent = store.listEvents('match-test').find((event) => event.type === 'night_resolved')!;
  assert.deepEqual(publicEvent.payload.deaths, []);

  const projected = store.loadMatch('match-test')?.state as {
    rounds?: Array<{ night?: { deaths?: Array<{ id: number; reason: string }> } }>;
    players?: Array<{ id: number; alive?: boolean; deathDay?: number; deathReason?: string }>;
  };
  assert.deepEqual(projected.rounds?.[0]?.night?.deaths, []);
  assert.equal(projected.players?.find((player) => player.id === 2)?.alive, true);
  assert.equal(projected.players?.find((player) => player.id === 3)?.alive, true);
});

test('Werewolf night_resolution deduplicates wolf kill and poison on same target', async () => {
  const store = new MemoryMatchStateStore();
  store.addMatch(createMatch({
    state: {
      players: [{ id: 2, alive: true }],
      rounds: [{ day: 1, phase: 'night', night: { wolfTarget: 2, witchPoisonTarget: 2 } }],
    },
  }));
  store.enqueueEffect({
    id: 'effect-night-resolution-duplicate',
    matchId: 'match-test',
    effectType: 'night_resolution',
    status: 'proposed',
    payload: { day: 1 },
  });
  const engine = new GameEngine({ store });
  engine.registerDefinition(createWerewolfGameDefinition());

  await engine.resolveEffects('match-test');
  const publicEvent = store.listEvents('match-test').find((event) => event.type === 'night_resolved')!;
  assert.deepEqual(publicEvent.payload.deaths, [{ id: 2, reason: '狼人袭击' }]);

  const projected = store.loadMatch('match-test')?.state as {
    players?: Array<{ id: number; alive?: boolean; deathReason?: string }>;
  };
  const target = projected.players?.find((player) => player.id === 2);
  assert.equal(target?.alive, false);
  assert.equal(target?.deathReason, '狼人袭击');
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
