import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeWerewolfEventIntoGame,
  resolveActiveSheriffId,
} from '../../packages/client/src/features/werewolf/utils/gameState';
import { EventDeliverySubscriber } from '../../packages/server/modules/werewolf/eventDeliverySubscriber';

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
    payload: { actionType: 'seer_check', seerCheck: { target: 1, result: '狼人' } },
    metadata,
    presentation,
  });
  assert.deepEqual(seer.seerCheck, { target: 1, result: '狼人' });

  const witch = toFlatEvent({
    type: 'witch-action',
    channel: 'scope',
    scopeKey: 'witch',
    payload: { actionType: 'witch_poison', witchAction: { use: false, target: null, reason: '' } },
    metadata,
    presentation,
  });
  assert.deepEqual(witch.witchAction, { use: false, target: null, reason: '' });
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
    seerCheck: { target: '1', result: '狼人' },
  });
  assert.deepEqual(seer.rounds?.[0].night?.seerCheck, { target: '1', result: '狼人' });

  const witch = mergeWerewolfEventIntoGame(seer, {
    type: 'witch-action',
    metadata: { day: 1, phase: 'night' },
    witchAction: { use: false, target: null, reason: '' },
  });
  assert.equal(witch.rounds?.[0].night?.witchPoisonTarget, undefined);
});
