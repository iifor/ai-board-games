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

test('Undercover exposes the speech queue toggle as an independent accessible control', () => {
  const hook = readFileSync(resolve('packages/client/src/features/undercover/hooks/useUndercoverGame.ts'), 'utf8');
  const controls = readFileSync(resolve('packages/client/src/features/undercover/components/UndercoverControls.tsx'), 'utf8');
  const game = readFileSync(resolve('packages/client/src/features/undercover/UndercoverGame/index.tsx'), 'utf8');

  assert.match(hook, /const \{ speechEnabled, setSpeechEnabled,/);
  assert.match(hook, /speechEnabled,\s*setSpeechEnabled,/);
  assert.match(controls, /speechEnabled: boolean/);
  assert.match(controls, /aria-pressed=\{speechEnabled\}/);
  assert.match(controls, /onToggleSpeech\(!speechEnabled\)/);
  assert.match(game, /speechEnabled=\{controller\.speechEnabled\}/);
  assert.match(game, /onToggleSpeech=\{controller\.setSpeechEnabled\}/);
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

test('Undercover vote summary names runoff tie candidates and the eliminated player', () => {
  let summary: {
    getUndercoverVoteSummary?: (game: unknown) => string[];
  } | undefined;
  try {
    summary = require('../../packages/client/src/features/undercover/components/undercoverVoteSummary');
  } catch {
    summary = undefined;
  }
  assert.equal(typeof summary?.getUndercoverVoteSummary, 'function');

  const game = {
    id: 'game-1',
    gameType: 'undercover',
    mode: 'standard-6',
    status: 'voting',
    round: 2,
    players: [
      { id: 2, nickname: '小北', alive: true },
      { id: 4, nickname: '阿青', alive: false, eliminatedRound: 2 }
    ],
    speeches: [],
    voteResult: {
      round: 2,
      runoff: false,
      votes: { '2': 4, '4': 2 },
      tally: { '2': 1, '4': 1 },
      tiedCandidateIds: [2, 4],
    }
  };
  assert.deepEqual(summary!.getUndercoverVoteSummary!(game), [
    '平票候选：2号 小北、4号 阿青，将进入加赛投票。'
  ]);
  assert.deepEqual(summary!.getUndercoverVoteSummary!({
    ...game,
    voteResult: {
      round: 2,
      runoff: true,
      votes: {},
      tally: { '2': 1, '4': 1 },
      tiedCandidateIds: [],
      eliminatedPlayerId: 4
    }
  }), [
    '本轮为加赛投票。',
    '本轮淘汰：4号 阿青。'
  ]);
});

test('Undercover reducer normalizes aggregate vote payloads without retaining ballots', () => {
  const feature = require('../../packages/client/src/features/undercover/hooks/useUndercoverGame') as typeof import('../../packages/client/src/features/undercover/hooks/useUndercoverGame');
  const summary = require('../../packages/client/src/features/undercover/components/undercoverVoteSummary') as {
    getUndercoverVoteSummary: (game: unknown) => string[];
  };
  const publicGame = {
    id: 'game-1',
    gameType: 'undercover' as const,
    mode: 'standard-6' as const,
    status: 'voting' as const,
    round: 2,
    players: [
      { id: 2, nickname: '小北', alive: true },
      { id: 4, nickname: '阿青', alive: true }
    ],
    speeches: []
  };

  const tied = feature.reduceUndercoverViewState(feature.EMPTY_UNDERCOVER_VIEW_STATE, {
    type: 'undercover-vote-result',
    game: publicGame,
    payload: {
      message: '本轮投票平票，进入复投。',
      round: 2,
      runoff: false,
      tally: { '2': 1, '4': 1 },
      tiedCandidateIds: [2, 4],
      votes: { '2': 4, '4': 2 }
    }
  });
  assert.deepEqual(tied.game?.voteResult, {
    round: 2,
    runoff: false,
    votes: {},
    tally: { '2': 1, '4': 1 },
    tiedCandidateIds: [2, 4]
  });

  const runoff = feature.reduceUndercoverViewState(tied, {
    type: 'undercover-vote-result',
    game: publicGame,
    payload: {
      message: '投票结束。',
      round: 2,
      runoff: true,
      tally: { '2': 1, '4': 1 },
      tiedCandidateIds: [],
      eliminatedPlayerId: 4,
      votes: { '2': 4, '4': 2 }
    }
  });
  assert.deepEqual(summary.getUndercoverVoteSummary(runoff.game), [
    '本轮为加赛投票。',
    '本轮淘汰：4号 阿青。'
  ]);
  assert.deepEqual(runoff.game?.voteResult?.votes, {});

  const eliminated = feature.reduceUndercoverViewState(runoff, {
    type: 'undercover-eliminated',
    game: {
      ...publicGame,
      players: publicGame.players.map((player) => player.id === 4 ? { ...player, alive: false, eliminatedRound: 2 } : player)
    }
  });
  assert.equal(eliminated.game?.voteResult?.eliminatedPlayerId, 4);
});
