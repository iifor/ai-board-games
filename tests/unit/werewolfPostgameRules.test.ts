import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePostgameSpeechDecision,
  resolvePostgameSpeechOrder,
  selectWerewolfMvp,
} from '../../packages/server/modules/werewolf/postgameRules';
import { createWerewolfSteps } from '../../packages/server/modules/werewolf/steps';

const players = [
  { id: 1, faction: 'good', alive: false },
  { id: 2, faction: 'wolves', alive: true },
  { id: 3, faction: 'good', alive: true },
  { id: 4, faction: 'wolves', alive: false },
];

test('MVP votes include dead players and reject self or invalid targets', () => {
  const result = selectWerewolfMvp(players, [
    { voterId: 1, targetId: 2 },
    { voterId: 2, targetId: 2 },
    { voterId: 3, targetId: 99 },
    { voterId: 4, targetId: 2 },
  ], 'wolves');

  assert.deepEqual(result.votes, [
    { voterId: 1, targetId: 2 },
    { voterId: 4, targetId: 2 },
  ]);
  assert.equal(result.player?.id, 2);
  assert.equal(result.tally['2'], 2);
});

test('MVP tie prefers winning faction then lower seat', () => {
  const result = selectWerewolfMvp(players, [
    { voterId: 1, targetId: 3 },
    { voterId: 2, targetId: 4 },
  ], 'wolves');
  assert.equal(result.player?.id, 4);

  const sameFaction = selectWerewolfMvp(players, [
    { voterId: 1, targetId: 2 },
    { voterId: 3, targetId: 4 },
  ], 'wolves');
  assert.equal(sameFaction.player?.id, 2);
});

test('MVP no-vote fallback uses lowest winning seat and MVP speaks last', () => {
  const result = selectWerewolfMvp(players, [], 'good');
  assert.equal(result.player?.id, 1);
  assert.deepEqual(resolvePostgameSpeechOrder(players, result.player?.id).map((player) => player.id), [2, 3, 4, 1]);
});

test('postgame workflow starts with daybreak then MVP intro and speeches follow result', () => {
  const ids = createWerewolfSteps().map((step) => step.id);
  const daybreak = ids.indexOf('postgame_daybreak');
  const intro = ids.indexOf('postgame_mvp_intro');
  const vote = ids.indexOf('postgame_mvp_vote');
  const result = ids.indexOf('postgame_mvp_result');
  const speeches = ids.indexOf('postgame_speech');
  assert.ok(daybreak < intro && intro < vote && vote < result && result < speeches);
});

test('postgame speech decision supports speaking or skipping', () => {
  assert.deepEqual(normalizePostgameSpeechDecision({ speak: false, text: 'ignored' }), {
    speak: false,
    text: '',
    thinking: '',
  });
  assert.deepEqual(normalizePostgameSpeechDecision({ speak: true, text: '  Good game.  ' }), {
    speak: true,
    text: 'Good game.',
    thinking: '',
  });
  assert.equal(normalizePostgameSpeechDecision({ speak: true, text: '   ' }).speak, false);
  assert.equal(normalizePostgameSpeechDecision(null).speak, false);
});
