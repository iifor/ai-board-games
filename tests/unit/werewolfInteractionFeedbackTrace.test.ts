import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEREWOLF_INTERACTION_FEEDBACK_EVENT,
  buildWerewolfInteractionFeedbackEvent,
  recordWerewolfInteractionFeedback,
} from '../../packages/server/modules/werewolf/interactionFeedbackTrace';

test('Werewolf interaction trace records scoped seer check feedback', () => {
  const event = buildWerewolfInteractionFeedbackEvent({
    matchId: 'match-trace',
    actionType: 'seer_check',
    actorId: 3,
    payload: { day: 1, target: '8', result: '狼人' },
    phase: 'night',
  });

  assert.equal(event?.type, WEREWOLF_INTERACTION_FEEDBACK_EVENT);
  assert.equal(event?.feedbackKind, 'seer_check_result');
  assert.equal(event?.actorId, 3);
  assert.equal(event?.target, 8);
  assert.equal(event?.result, '狼人');
  assert.equal(event?.channel, 'scope');
  assert.equal(event?.scopeKey, 'seer');
  assert.deepEqual(event?.visibleTo, ['role:seer', 'system']);
});

test('Werewolf interaction trace records scoped guard feedback', () => {
  const event = buildWerewolfInteractionFeedbackEvent({
    matchId: 'match-trace',
    actionType: 'guard_protect',
    actorId: 4,
    payload: { day: 1, target: 9 },
    phase: 'night',
  });

  assert.equal(event?.feedbackKind, 'guard_protect_result');
  assert.equal(event?.target, 9);
  assert.equal(event?.result, 'protected');
  assert.equal(event?.channel, 'scope');
  assert.equal(event?.scopeKey, 'guard');
});

test('Werewolf interaction trace records witch antidote feedback with wolf target', () => {
  const event = buildWerewolfInteractionFeedbackEvent({
    matchId: 'match-trace',
    actionType: 'witch_save',
    actorId: 5,
    payload: { day: 1, use: true },
    round: { night: { wolfTarget: 8 } },
    phase: 'night',
  });

  assert.equal(event?.feedbackKind, 'witch_save_result');
  assert.equal(event?.target, 8);
  assert.equal(event?.wolfTarget, 8);
  assert.equal(event?.used, true);
  assert.equal(event?.result, 'saved');
  assert.equal(event?.channel, 'scope');
  assert.equal(event?.scopeKey, 'witch');
});

test('Werewolf interaction trace records skipped witch poison feedback', () => {
  const event = buildWerewolfInteractionFeedbackEvent({
    matchId: 'match-trace',
    actionType: 'witch_poison',
    actorId: 5,
    payload: { day: 1, use: false, target: null },
    phase: 'night',
  });

  assert.equal(event?.feedbackKind, 'witch_poison_result');
  assert.equal(event?.target, null);
  assert.equal(event?.used, false);
  assert.equal(event?.result, 'skipped');
  assert.equal(event?.channel, 'scope');
  assert.equal(event?.scopeKey, 'witch');
});

test('Werewolf interaction trace records public hunter shot feedback', () => {
  const event = buildWerewolfInteractionFeedbackEvent({
    matchId: 'match-trace',
    actionType: 'hunter_shot',
    actorId: 6,
    payload: { target: 10 },
    day: 1,
    phase: 'day',
    reason: 'exile',
  });

  assert.equal(event?.feedbackKind, 'hunter_shot_result');
  assert.equal(event?.target, 10);
  assert.equal(event?.result, 'shot');
  assert.equal(event?.channel, 'public');
  assert.equal(event?.scopeKey, undefined);
  assert.deepEqual(event?.visibleTo, ['public', 'system']);
  assert.equal(event?.triggerReason, 'exile');
});

test('Werewolf interaction trace no-ops safely when no active trace exists', () => {
  assert.doesNotThrow(() => recordWerewolfInteractionFeedback({
    matchId: 'missing-active-trace',
    actionType: 'seer_check',
    actorId: 3,
    payload: { target: 8, result: '好人' },
    day: 1,
    phase: 'night',
  }));
});
