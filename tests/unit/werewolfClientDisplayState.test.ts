import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canSubmitWerewolfSetup,
  mergeWerewolfEventIntoGame,
  resolveActiveSheriffId,
} from '../../packages/client/src/features/werewolf/utils/gameState';
import { getNightActionPlayerIds, getWerewolfNightActionBadges } from '../../packages/client/src/features/werewolf/werewolfUtils';
import { EventDeliverySubscriber } from '../../packages/server/modules/werewolf/eventDeliverySubscriber';

test('mode 29 client merges hunter vote and thick wolf armor events', () => {
  const game = {
    id: 'mode-29-client',
    rounds: [{ day: 1, phase: 'night', night: {} }],
    players: [
      { id: 1, role: 'escape_hunter', faction: 'hunters', alive: true },
      { id: 2, role: 'thick_wolf', faction: 'good', alive: true },
    ],
  };
  const voted = mergeWerewolfEventIntoGame(game, {
    type: 'escape-hunter-vote',
    metadata: { day: 1, phase: 'night' },
    escapeHunterTarget: 2,
    escapeHunterChoices: { 1: 2 },
    escapeHunterVoteTally: { 2: 1 },
  });
  const armored = mergeWerewolfEventIntoGame(voted, {
    type: 'thick-wolf-armor',
    metadata: { day: 1, phase: 'night' },
    targetId: 2,
  });

  assert.equal(armored.rounds?.[0].night?.escapeHunterTarget, 2);
  assert.deepEqual(armored.rounds?.[0].night?.escapeHunterChoices, { 1: 2 });
  assert.deepEqual(armored.rounds?.[0].night?.thickWolfArmorBreak, { targetId: 2 });
});

test('mode 29 client highlights hunters and renders hunt and armor badges', () => {
  const players = [
    { id: 1, role: 'escape_hunter', faction: 'hunters', alive: true },
    { id: 2, role: 'escape_hunter', faction: 'hunters', alive: true },
    { id: 3, role: 'thick_wolf', faction: 'good', alive: true },
  ];
  const round = {
    day: 1,
    phase: 'night',
    night: {
      escapeHunterChoices: { 1: 3, 2: 3 },
      escapeHunterTarget: 3,
      thickWolfArmorBreak: { targetId: 3 },
    },
  };

  assert.deepEqual(getNightActionPlayerIds('escape-hunter-vote', players), [1, 2]);
  assert.equal(getWerewolfNightActionBadges(round, players[0], 'escape-hunter-vote', players)[0]?.kind, 'escape-hunt');
  assert.equal(getWerewolfNightActionBadges(round, players[2], 'thick-wolf-armor', players)[0]?.kind, 'thick-wolf-armor');
});

test('werewolf client display state keeps active sheriff across later rounds', () => {
  const rounds = [
    {
      day: 1,
      phase: 'day',
      sheriffId: '3',
      sheriffBadge: { status: 'held' },
      sheriffElection: { sheriffId: '3', result: 'elected' },
    },
    {
      day: 2,
      phase: 'night',
      night: {},
    },
  ];

  assert.equal(resolveActiveSheriffId(rounds, rounds[1]), '3');
});

test('werewolf setup can submit debug mode before player count is complete', () => {
  assert.equal(canSubmitWerewolfSetup({ modeId: 'standard-12', selectedCount: 0, requiredCount: 12, availableCount: 12, debugMode: true }), true);
  assert.equal(canSubmitWerewolfSetup({ modeId: 'standard-12', selectedCount: 0, requiredCount: 12, availableCount: 0, debugMode: true }), false);
  assert.equal(canSubmitWerewolfSetup({ modeId: 'standard-12', selectedCount: 0, requiredCount: 12, debugMode: false }), false);
});

test('werewolf client display state clears sheriff after badge tear', () => {
  const rounds = [
    { day: 1, phase: 'day', sheriffId: '3', sheriffBadge: { status: 'held' } },
    {
      day: 2,
      phase: 'day',
      sheriffBadge: { status: 'torn' },
      sheriffTransfers: [{ action: 'tear', from: 3 }],
    },
  ];

  assert.equal(resolveActiveSheriffId(rounds, rounds[1]), null);
});

test('werewolf client display state applies public sheriff transfer payload', () => {
  const game = {
    id: 'g-sheriff',
    rounds: [{ day: 2, phase: 'day', sheriffId: '3', sheriffBadge: { status: 'held' } }],
    players: [{ id: 1 }, { id: 3 }],
  };
  const merged = mergeWerewolfEventIntoGame(game, {
    type: 'sheriff-badge-transfer',
    metadata: { day: 2, phase: 'day' },
    sheriffId: 1,
    sheriffBadge: { status: 'held' },
    sheriffTransfer: { action: 'transfer', from: 3, to: 1 },
  });

  assert.equal(merged.rounds?.[0].sheriffId, 1);
  assert.deepEqual(merged.rounds?.[0].sheriffBadge, { status: 'held' });
});

test('werewolf client display state patches vote-result into current round', () => {
  const game = {
    id: 'g1',
    rounds: [{ day: 1, phase: 'day', night: {}, votes: {}, voteTally: {} }],
    players: [
      { id: 1, alive: true },
      { id: 2, alive: true },
      { id: 3, alive: true },
    ],
  };
  const merged = mergeWerewolfEventIntoGame(game, {
    type: 'vote-result',
    metadata: { day: 1, phase: 'day' },
    votes: { 1: 2, 3: 2 },
    tally: { 2: 2 },
    exile: { id: 2, reason: 'exile' },
  });

  assert.deepEqual(merged.rounds?.[0].votes, { 1: 2, 3: 2 });
  assert.deepEqual(merged.rounds?.[0].voteTally, { 2: 2 });
  assert.deepEqual(merged.rounds?.[0].exile, { id: 2, reason: 'exile' });
});

test('werewolf event delivery flattens vote-result payload for C-end display', () => {
  const subscriber = new EventDeliverySubscriber({ subscribeAll: () => () => {} } as never, () => {});
  const flat = (subscriber as unknown as { toFlatEvent: (event: unknown) => Record<string, unknown> }).toFlatEvent({
    type: 'vote-result',
    channel: 'public',
    payload: {
      votes: { 1: 2, 3: 2 },
      tally: { 2: 2 },
      exile: { id: 2, reason: 'exile' },
      message: '2号玩家被放逐',
    },
    metadata: { matchId: 'm1', stepId: 's1', day: 1, phase: 'day', sequence: 10 },
    presentation: { speakableText: '2号玩家被放逐' },
  });

  assert.equal(flat.type, 'workflow-event');
  assert.equal(flat.workflowEvent, 'vote-result');
  assert.deepEqual(flat.votes, { 1: 2, 3: 2 });
  assert.deepEqual(flat.tally, { 2: 2 });
  assert.deepEqual(flat.exile, { id: 2, reason: 'exile' });
});

test('werewolf event delivery flattens private night completion payloads', () => {
  const subscriber = new EventDeliverySubscriber({ subscribeAll: () => () => {} } as never, () => {});
  const toFlatEvent = (subscriber as unknown as { toFlatEvent: (event: unknown) => Record<string, unknown> }).toFlatEvent.bind(subscriber);
  const metadata = { matchId: 'm1', stepId: 'night', day: 1, phase: 'night', sequence: 1 };
  const presentation = { speakableText: '', displayText: '', displayMode: 'badge', uiHint: '', suppressSpeech: true };

  const wolf = toFlatEvent({
    type: 'wolf-vote',
    channel: 'scope',
    scopeKey: 'wolves',
    payload: { actionType: 'wolf_vote', wolfTarget: 4, wolfChoices: { 1: 4 }, wolfVoteTally: { 4: 1 } },
    metadata,
    presentation,
  });
  assert.equal(wolf.wolfTarget, 4);
  assert.deepEqual(wolf.wolfChoices, { 1: 4 });
  assert.deepEqual(wolf.wolfVoteTally, { 4: 1 });

  const seer = toFlatEvent({
    type: 'seer-check',
    channel: 'scope',
    scopeKey: 'seer',
    payload: {
      actionType: 'seer_check',
      seerCheck: { target: 1, result: '狼人', reason: '验证前置位' },
      speech: { playerId: 3, text: '1号玩家的身份是：狼人。验证前置位' },
    },
    metadata,
    presentation,
  });
  assert.deepEqual(seer.seerCheck, { target: 1, result: '狼人', reason: '验证前置位' });
  assert.deepEqual(seer.speech, { playerId: 3, text: '1号玩家的身份是：狼人。验证前置位', thinking: '' });

  const guard = toFlatEvent({
    type: 'guard-action',
    channel: 'scope',
    scopeKey: 'guard',
    payload: { actionType: 'guard_protect', guardAction: { target: 2, reason: '保护关键位' } },
    metadata,
    presentation,
  });
  assert.deepEqual(guard.guardAction, { target: 2, reason: '保护关键位' });

  const witch = toFlatEvent({
    type: 'witch-action',
    channel: 'scope',
    scopeKey: 'witch',
    payload: { actionType: 'witch_poison', witchAction: { use: false, target: null, reason: '' } },
    metadata,
    presentation,
  });
  assert.deepEqual(witch.witchAction, { use: false, target: null, reason: '' });

  const fortuneTeller = toFlatEvent({
    type: 'fortune-teller-mark',
    channel: 'scope',
    scopeKey: 'fortune_teller',
    payload: { actionType: 'fortune_teller_mark', fortuneTellerMark: { target: 2, reason: '标记焦点位' } },
    metadata,
    presentation,
  });
  assert.deepEqual(fortuneTeller.fortuneTellerMark, { target: 2, reason: '标记焦点位' });

  const bigBadWolf = toFlatEvent({
    type: 'big-bad-wolf-kill',
    channel: 'scope',
    scopeKey: 'wolves',
    payload: { actionType: 'big_bad_wolf_kill', bigBadWolfTarget: 3, reason: '额外刀口' },
    metadata,
    presentation,
  });
  assert.equal(bigBadWolf.bigBadWolfTarget, 3);

  const crow = toFlatEvent({
    type: 'crow-curse',
    channel: 'scope',
    scopeKey: 'crow',
    payload: { actionType: 'crow_curse', crowCurse: { target: 4, reason: '压票' } },
    metadata,
    presentation,
  });
  assert.deepEqual(crow.crowCurse, { target: 4, reason: '压票' });

  const bearTamer = toFlatEvent({
    type: 'bear-tamer-roar',
    channel: 'scope',
    scopeKey: 'bear_tamer',
    payload: { actionType: 'bear_tamer_roar', bearRoar: { roaring: true, adjacentWolfIds: [2] } },
    metadata,
    presentation,
  });
  assert.deepEqual(bearTamer.bearRoar, { roaring: true, adjacentWolfIds: [2] });

  const escapeHunter = toFlatEvent({
    type: 'escape-hunter-vote',
    channel: 'scope',
    scopeKey: 'escape_hunters',
    payload: {
      actionType: 'escape_hunter_vote',
      escapeHunterTarget: 4,
      escapeHunterChoices: { 1: 4, 2: 4 },
      escapeHunterVoteTally: { 4: 2 },
    },
    metadata,
    presentation,
  });
  assert.equal(escapeHunter.escapeHunterTarget, 4);
  assert.deepEqual(escapeHunter.escapeHunterChoices, { 1: 4, 2: 4 });
  assert.deepEqual(escapeHunter.escapeHunterVoteTally, { 4: 2 });
});

test('werewolf client display state merges night completion patches', () => {
  const game = { id: 'g1', rounds: [{ day: 1, phase: 'night', night: {} }] };
  const wolf = mergeWerewolfEventIntoGame(game, {
    type: 'wolf-vote',
    metadata: { day: 1, phase: 'night' },
    wolfTarget: 4,
    wolfChoices: { 1: 4 },
    wolfVoteTally: { 4: 1 },
  });
  assert.equal(wolf.rounds?.[0].night?.wolfTarget, '4');

  const seer = mergeWerewolfEventIntoGame(wolf, {
    type: 'seer-check',
    metadata: { day: 1, phase: 'night' },
    seerCheck: { target: '1', result: '狼人', reason: '验证前置位' },
  });
  assert.deepEqual(seer.rounds?.[0].night?.seerCheck, { target: '1', result: '狼人', reason: '验证前置位' });

  const guard = mergeWerewolfEventIntoGame(seer, {
    type: 'guard-action',
    actionType: 'guard_protect',
    metadata: { day: 1, phase: 'night' },
    guardAction: { target: '2', reason: '保护关键位' },
  });
  assert.equal(guard.rounds?.[0].night?.guardTarget, '2');
  assert.equal(guard.rounds?.[0].night?.guardReason, '保护关键位');

  const save = mergeWerewolfEventIntoGame(guard, {
    type: 'witch-action',
    actionType: 'witch_save',
    metadata: { day: 1, phase: 'night' },
    witchAction: { use: true, target: '3', reason: '救关键位' },
  });
  assert.equal(save.rounds?.[0].night?.witchSaveTarget, '3');
  assert.equal(save.rounds?.[0].night?.witchSaveReason, '救关键位');
  assert.equal(save.rounds?.[0].night?.witchPoisonTarget, undefined);

  const witch = mergeWerewolfEventIntoGame(save, {
    type: 'witch-action',
    actionType: 'witch_poison',
    metadata: { day: 1, phase: 'night' },
    witchAction: { use: false, target: null, reason: '' },
  });
  assert.equal(witch.rounds?.[0].night?.witchPoisonTarget, undefined);
});

test('werewolf client display state merges modes 14 to 16 skill patches', () => {
  const game = { id: 'g14', rounds: [{ day: 1, phase: 'night', night: {} }] };
  const marked = mergeWerewolfEventIntoGame(game, {
    type: 'fortune-teller-mark',
    metadata: { day: 1, phase: 'night' },
    fortuneTellerMark: { target: 2, reason: '标记焦点位' },
  });
  assert.deepEqual(marked.rounds?.[0].night?.fortuneTellerMark, { target: 2, reason: '标记焦点位' });

  const killed = mergeWerewolfEventIntoGame(marked, {
    type: 'big-bad-wolf-kill',
    metadata: { day: 1, phase: 'night' },
    bigBadWolfTarget: 3,
    reason: '额外刀口',
  });
  assert.equal(killed.rounds?.[0].night?.bigBadWolfTarget, 3);
  assert.equal(killed.rounds?.[0].night?.bigBadWolfReason, '额外刀口');

  const cursed = mergeWerewolfEventIntoGame(killed, {
    type: 'crow-curse',
    metadata: { day: 1, phase: 'night' },
    crowCurse: { target: 4, reason: '压票' },
  });
  assert.deepEqual(cursed.rounds?.[0].night?.crowCurse, { target: 4, reason: '压票' });
  assert.equal(cursed.rounds?.[0].crowCursedPlayerId, 4);

  const roared = mergeWerewolfEventIntoGame(cursed, {
    type: 'bear-tamer-roar',
    metadata: { day: 1, phase: 'day' },
    bearRoar: { roaring: true, adjacentWolfIds: [5] },
  });
  assert.deepEqual(roared.rounds?.[0].bearRoar, { roaring: true, adjacentWolfIds: [5] });
});

test('werewolf client display badges include modes 14 to 16 skill results', () => {
  const players = [
    { id: 1, role: 'fortune_teller', faction: 'good', alive: true },
    { id: 2, role: 'big_bad_wolf', faction: 'wolves', alive: true },
    { id: 3, role: 'crow', faction: 'good', alive: true },
    { id: 4, role: 'bear_tamer', faction: 'good', alive: true },
    { id: 5, role: 'villager', faction: 'good', alive: true },
  ];
  const round = {
    day: 1,
    phase: 'day',
    bearRoar: { roaring: true, adjacentWolfIds: [2] },
    night: {
      fortuneTellerMark: { target: 5 },
      bigBadWolfTarget: 5,
      crowCurse: { target: 5 },
    },
  };

  assert.equal(getWerewolfNightActionBadges(round, players[0], 'fortune-teller-mark', players)[0]?.kind, 'fortune-teller');
  assert.equal(getWerewolfNightActionBadges(round, players[1], 'big-bad-wolf-kill', players)[0]?.kind, 'big-bad-wolf');
  assert.equal(getWerewolfNightActionBadges(round, players[2], 'crow-curse', players)[0]?.prefix, '+1');
  assert.equal(getWerewolfNightActionBadges(round, players[3], 'bear-tamer-roar', players)[0]?.label, '咆哮');
});
