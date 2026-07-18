import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkWinner,
  containsSecretWord,
  createInitialUndercoverState,
  eliminatePlayer,
  getLegalVoteTargets,
  resolveVote,
  seededIndex,
} from '../../packages/server/modules/undercover/rules';

const players = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  nickname: `${index + 1}号`,
}));

test('undercover setup assigns one secret holder without exposing it publicly', () => {
  const state = createInitialUndercoverState(players, {
    seed: 7,
    wordPair: { civilian: '咖啡', undercover: '茶' },
    undercoverPlayerId: 6,
  });
  assert.equal(state.undercoverPlayerId, 6);
  assert.deepEqual(state.playerWords, { 1: '咖啡', 2: '咖啡', 3: '咖啡', 4: '咖啡', 5: '咖啡', 6: '茶' });
});

test('vote targets exclude self, eliminated players, and non-runoff candidates', () => {
  const state = createInitialUndercoverState(players, { seed: 7, wordPair: { civilian: '咖啡', undercover: '茶' }, undercoverPlayerId: 6 });
  state.players[4].alive = false;
  assert.deepEqual(getLegalVoteTargets(state, 1), [2, 3, 4, 6]);
  assert.deepEqual(getLegalVoteTargets(state, 1, [2, 6]), [2, 6]);
});

test('first tie requests runoff and second tie uses stable seeded elimination', () => {
  const state = createInitialUndercoverState(players, { seed: 7, wordPair: { civilian: '咖啡', undercover: '茶' }, undercoverPlayerId: 6 });
  const votes = { 1: 2, 2: 1, 3: 2, 4: 1, 5: 2, 6: 1 };
  assert.deepEqual(resolveVote(state, votes, false), { kind: 'runoff', candidateIds: [1, 2], tally: { 1: 3, 2: 3 } });
  const result = resolveVote(state, votes, true);
  assert.equal(result.kind, 'eliminate');
  assert.ok([1, 2].includes(result.playerId));
});

test('winner is civilians when undercover leaves and undercover at three alive', () => {
  const state = createInitialUndercoverState(players, { seed: 7, wordPair: { civilian: '咖啡', undercover: '茶' }, undercoverPlayerId: 6 });
  assert.deepEqual(checkWinner(eliminatePlayer(state, 6, 1)), { winner: 'civilians', reason: '卧底被淘汰' });
  const reduced = eliminatePlayer(eliminatePlayer(eliminatePlayer(state, 1, 1), 2, 2), 3, 3);
  assert.deepEqual(checkWinner(reduced), { winner: 'undercover', reason: '卧底存活至最后三人' });
});

test('seed fallbacks are deterministic and secret words are detected', () => {
  const state = createInitialUndercoverState(players, { seed: 7 });
  assert.equal(state.undercoverPlayerId, players[seededIndex(7, players.length, 1)].id);
  assert.equal(containsSecretWord('我喜欢咖啡', { civilian: '咖啡', undercover: '茶' }), true);
  assert.equal(containsSecretWord('我喜欢果汁', { civilian: '咖啡', undercover: '茶' }), false);
  assert.throws(() => seededIndex(7, 0), /empty collection/);
});
