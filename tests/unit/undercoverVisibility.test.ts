import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialUndercoverState } from '../../packages/server/modules/undercover/rules';
import { buildUndercoverSpeechPrompt, buildUndercoverVotePrompt } from '../../packages/server/modules/undercover/prompts';
import { createUndercoverPresentationEvent, toUndercoverPublicState } from '../../packages/server/modules/undercover/presentation';

const state = createInitialUndercoverState(
  Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nickname: `${index + 1}号` })),
  { seed: 7, wordPair: { civilian: '咖啡', undercover: '茶' }, undercoverPlayerId: 6 },
);

test('each speech prompt contains only the actor secret word', () => {
  const civilianPrompt = buildUndercoverSpeechPrompt(state, 1);
  const undercoverPrompt = buildUndercoverSpeechPrompt(state, 6);
  assert.match(civilianPrompt, /咖啡/);
  assert.doesNotMatch(civilianPrompt, /茶/);
  assert.match(undercoverPrompt, /你的词是“茶”/);
  assert.doesNotMatch(undercoverPrompt, /咖啡/);
});

test('vote prompt contains only the actor secret word and public vote context', () => {
  const prompt = buildUndercoverVotePrompt(state, 1, [2, 3, 6]);
  assert.match(prompt, /咖啡/);
  assert.doesNotMatch(prompt, /茶|undercoverPlayerId|你是卧底/);
  assert.match(prompt, /2, 3, 6/);
});

test('public state and pre-result events contain no secrets', () => {
  const publicState = toUndercoverPublicState(state);
  const event = createUndercoverPresentationEvent('undercover-game-start', state, { message: '游戏开始' });
  const serialized = JSON.stringify({ publicState, event });
  assert.doesNotMatch(serialized, /咖啡|茶|undercoverPlayerId/);
});

test('public speech projection excludes non-public runtime fields', () => {
  const stateWithInternalSpeech = {
    ...state,
    speeches: [{ round: 1, playerId: 1, text: '描述', internalSecret: '咖啡' }],
  };
  const publicState = toUndercoverPublicState(stateWithInternalSpeech);
  assert.deepEqual(publicState.speeches, [{ round: 1, playerId: 1, text: '描述' }]);
  assert.doesNotMatch(JSON.stringify(publicState), /internalSecret|咖啡/);
});

test('result event reveals both words and the undercover id', () => {
  const completed = { ...state, status: 'completed' as const, winner: 'civilians' as const, winReason: '卧底被淘汰' };
  const event = createUndercoverPresentationEvent('undercover-game-result', completed, { message: '平民获胜' });
  assert.match(JSON.stringify(event), /咖啡/);
  assert.match(JSON.stringify(event), /茶/);
  assert.equal(event.game?.reveal?.undercoverPlayerId, 6);
});
