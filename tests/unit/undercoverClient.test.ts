import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('game selection exposes an accessible Undercover player editor entry', () => {
  const source = readFileSync(resolve('packages/client/src/pages/GameSelectPage/index.tsx'), 'utf8');
  assert.match(source, /title: 'AI 谁是卧底'/);
  assert.match(source, /title=\{`选择 \$\{game\.title\}玩家`\}/);
  assert.match(source, /setEditingGame\(game\.key\)/);
  assert.match(source, />选择玩家<\/button>/);
});

test('Undercover client state hides secrets until completion and retains public progress', () => {
  let feature: typeof import('../../packages/client/src/features/undercover/hooks/useUndercoverGame') | undefined;
  try {
    feature = require('../../packages/client/src/features/undercover/hooks/useUndercoverGame');
  } catch {
    feature = undefined;
  }
  assert.equal(typeof feature?.reduceUndercoverViewState, 'function');

  const running = feature!.reduceUndercoverViewState(feature!.EMPTY_UNDERCOVER_VIEW_STATE, {
    type: 'undercover-vote-result',
    message: '第 1 轮投票结束',
    game: {
      id: 'game-1',
      gameType: 'undercover',
      mode: 'standard-6',
      status: 'voting',
      round: 1,
      players: [1, 2, 3, 4, 5, 6].map((id) => ({ id, nickname: `${id}号`, alive: id !== 6 })),
      speeches: [{ round: 1, playerId: 1, text: '描述一' }],
      voteResult: { round: 1, runoff: false, votes: { '1': 6 }, tally: { '6': 1 }, tiedCandidateIds: [], eliminatedPlayerId: 6 },
      reveal: { civilianWord: '咖啡', undercoverWord: '茶', undercoverPlayerId: 6 },
      wordPair: { civilian: '咖啡', undercover: '茶' }
    }
  });
  assert.equal(running.game?.round, 1);
  assert.equal(running.game?.voteResult?.eliminatedPlayerId, 6);
  assert.equal(running.game?.reveal, undefined);
  assert.equal('wordPair' in (running.game || {}), false);

  const completed = feature!.reduceUndercoverViewState(running, {
    type: 'undercover-game-result',
    game: {
      ...running.game!,
      status: 'completed',
      winner: 'civilians',
      reveal: { civilianWord: '咖啡', undercoverWord: '茶', undercoverPlayerId: 6 }
    }
  });
  assert.equal(completed.game?.reveal?.undercoverWord, '茶');
  assert.equal(completed.game?.reveal?.undercoverPlayerId, 6);
});

test('Undercover start config forwards exactly the selected six ids', () => {
  let feature: typeof import('../../packages/client/src/features/undercover/hooks/useUndercoverGame') | undefined;
  try {
    feature = require('../../packages/client/src/features/undercover/hooks/useUndercoverGame');
  } catch {
    feature = undefined;
  }
  assert.equal(typeof feature?.buildUndercoverStartOptions, 'function');
  assert.deepEqual(feature!.buildUndercoverStartOptions([9, 4, 7, 2, 8, 1], ''), { playerIds: [9, 4, 7, 2, 8, 1] });
  assert.deepEqual(feature!.buildUndercoverStartOptions([], 'history-1'), { replayGameId: 'history-1' });
  assert.throws(() => feature!.buildUndercoverStartOptions([1, 2, 3, 4, 5], ''), /固定选择 6 位 AI 玩家/);
  assert.throws(() => feature!.buildUndercoverStartOptions([1, 2, 3, 4, 5, 5], ''), /固定选择 6 位 AI 玩家/);
});
