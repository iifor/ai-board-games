import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { createElement } = require('../../packages/client/node_modules/react') as typeof import('react');
const { renderToStaticMarkup } = require('../../packages/client/node_modules/react-dom/server') as typeof import('react-dom/server');

function loadUndercoverComponents() {
  const originalCssLoader = require.extensions['.css'];
  require.extensions['.css'] = () => {};
  try {
    return {
      ...require('../../packages/client/src/features/undercover/components/UndercoverArena'),
      ...require('../../packages/client/src/features/undercover/components/UndercoverControls')
    } as typeof import('../../packages/client/src/features/undercover/components/UndercoverArena')
      & typeof import('../../packages/client/src/features/undercover/components/UndercoverControls');
  } finally {
    if (originalCssLoader) require.extensions['.css'] = originalCssLoader;
    else delete require.extensions['.css'];
  }
}

const undercoverComponents = loadUndercoverComponents();
const players = [1, 2, 3].map((id) => ({ id, nickname: `${id}号玩家`, alive: true }));

function speakingGame(playerId: number) {
  return {
    id: 'game-1',
    gameType: 'undercover' as const,
    mode: 'standard-6' as const,
    status: 'speaking' as const,
    round: 1,
    players,
    speeches: [{ round: 1, playerId, text: `${playerId}号发言` }]
  };
}

test('Undercover arena keeps classic DOM separate from the v2 spectator stage', () => {
  const classic = renderToStaticMarkup(createElement(undercoverComponents.UndercoverArena, {
    game: speakingGame(1),
    variant: 'classic'
  }));
  const v2 = renderToStaticMarkup(createElement(undercoverComponents.UndercoverArena, {
    game: speakingGame(1),
    variant: 'v2'
  }));

  assert.match(classic, /class="undercover-arena"/);
  assert.match(classic, /本轮发言/);
  assert.doesNotMatch(classic, /undercover-stage/);
  assert.doesNotMatch(classic, /undercover-speaker-poster/);
  assert.match(v2, /class="undercover-stage undercover-stage--speaking undercover-stage--v2"/);
  assert.match(v2, /undercover-speaker-poster/);
  assert.doesNotMatch(v2, /class="undercover-arena"/);
});

test('Undercover v2 speaking uses one lower-third strip without a duplicate speech card', () => {
  const classic = renderToStaticMarkup(createElement(undercoverComponents.UndercoverArena, {
    game: speakingGame(1),
    variant: 'classic',
  }));
  const v2 = renderToStaticMarkup(createElement(undercoverComponents.UndercoverArena, {
    game: speakingGame(1),
    variant: 'v2',
  }));

  assert.match(v2, /class="undercover-speaker-strip"/);
  assert.match(v2, /class="undercover-speaker-identity"/);
  assert.match(v2, /class="undercover-speaker-copy"/);
  assert.match(v2, /class="undercover-next-player"/);
  assert.doesNotMatch(v2, /<h2>正在发言<\/h2>/);
  assert.doesNotMatch(classic, /undercover-speaker-strip/);
});

test('Undercover v2 swaps the player poster for a host cutout only during host narration', () => {
  const markup = renderToStaticMarkup(createElement(undercoverComponents.UndercoverArena, {
    game: { ...speakingGame(1), status: 'voting' },
    variant: 'v2',
    host: { id: 0, nickname: '主持人' },
    activeSpeech: {
      id: 'host-1',
      playerId: null,
      text: '请开始投票。',
      speakerRole: 'host',
    },
  }));

  assert.match(markup, /undercover-host-poster/);
  assert.match(markup, /player-poster-cutouts\/host\.webp/);

  for (const activeSpeech of [
    { id: 'player-1', playerId: 1, text: '玩家发言。', speakerRole: 'player' },
    { id: 'host-empty', playerId: null, text: '', speakerRole: 'host' },
  ]) {
    const inactiveMarkup = renderToStaticMarkup(createElement(undercoverComponents.UndercoverArena, {
      game: speakingGame(1),
      variant: 'v2',
      activeSpeech,
    }));
    assert.doesNotMatch(inactiveMarkup, /undercover-host-poster/);
  }
});

test('Undercover controls keep classic behavior while v2 opts into the fixed control bar', () => {
  const props = {
    autoPlay: true,
    speechEnabled: true,
    started: false,
    replayMode: false,
    onReturn: () => {},
    onStart: () => {},
    onTogglePlayback: () => {},
    onToggleSpeech: () => {},
    onSkipPhase: () => {}
  };
  const classic = renderToStaticMarkup(createElement(undercoverComponents.UndercoverControls, {
    ...props,
    variant: 'classic'
  }));
  const v2 = renderToStaticMarkup(createElement(undercoverComponents.UndercoverControls, {
    ...props,
    variant: 'v2'
  }));

  assert.match(classic, /class="undercover-controls"/);
  assert.match(classic, />返回选择</);
  assert.match(classic, /title="开始谁是卧底对局">开始游戏</);
  assert.match(classic, /title="暂停自动播放"[^>]*disabled=""/);
  assert.doesNotMatch(classic, /undercover-controls--v2/);
  assert.match(v2, /class="undercover-controls undercover-controls--v2"/);
  assert.match(v2, />返回</);
  assert.doesNotMatch(v2, /title="暂停自动播放"/);
});

test('Undercover replay skip buttons never forward React click events', () => {
  const source = readFileSync(
    resolve('packages/client/src/features/undercover/components/UndercoverControls.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /onClick=\{onSkipPhase\}/);
  assert.equal(
    source.match(/onClick=\{\(\) => onSkipPhase\(\)\}/g)?.length,
    2,
  );
});

test('Undercover next-player cue exists only for a real following alive player', () => {
  assert.equal(undercoverComponents.getUndercoverArenaViewModel(speakingGame(1), 'v2').nextPlayer?.id, 2);
  assert.equal(undercoverComponents.getUndercoverArenaViewModel(speakingGame(2), 'v2').nextPlayer?.id, 3);
  assert.equal(undercoverComponents.getUndercoverArenaViewModel(speakingGame(3), 'v2').nextPlayer, undefined);
  assert.equal(undercoverComponents.getUndercoverArenaViewModel(speakingGame(99), 'v2').nextPlayer, undefined);
});

test('Undercover v2 layout CSS remains scoped to explicit v2 classes', () => {
  const arenaStyles = readFileSync(resolve('packages/client/src/features/undercover/components/UndercoverArena.css'), 'utf8');
  const gameStyles = readFileSync(resolve('packages/client/src/features/undercover/UndercoverGame/index.css'), 'utf8');
  const controlStyles = readFileSync(resolve('packages/client/src/features/undercover/components/UndercoverControls.css'), 'utf8');

  assert.match(arenaStyles, /\.undercover-stage--v2\s*\{/);
  for (let seat = 1; seat <= 6; seat += 1) {
    assert.match(arenaStyles, new RegExp(`undercover-stage--v2 \\.seat-${seat}`));
  }
  assert.doesNotMatch(arenaStyles, /^\.undercover-stage--v2 \.undercover-player-seat\.seat-\d+\s*\{/m);
  assert.match(arenaStyles, /\.undercover-stage--v2 \.undercover-speaker-poster \.player-poster-spotlight__caption\s*\{\s*display: none;/);
  assert.match(arenaStyles, /\.undercover-stage--v2\.undercover-stage--speaking \.undercover-focus/);
  assert.match(arenaStyles, /prefers-reduced-motion: reduce/);
  assert.match(gameStyles, /\.undercover-shell--v2 \.undercover-status/);
  assert.match(controlStyles, /\.undercover-controls--v2\s*\{[^}]*position: fixed;/s);
  assert.match(controlStyles, /@media \(max-width: 760px\)\s*\{\s*\.undercover-controls--v2 button\s*\{\s*min-width: 0;/);
});

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

test('Undercover derives host narration from an equivalent public presentation event', () => {
  const feature = require('../../packages/client/src/features/undercover/hooks/useUndercoverGame') as typeof import('../../packages/client/src/features/undercover/hooks/useUndercoverGame');
  const state = feature.reduceUndercoverViewState(feature.EMPTY_UNDERCOVER_VIEW_STATE, {
    type: 'undercover-round-start',
    ackId: 9,
    channel: 'public',
    payload: { message: 'Round one begins.' },
    presentation: {
      speakableText: 'Round one begins.',
      displayText: 'Round one begins.',
      displayMode: 'status',
      uiHint: 'undercover-round-start',
      suppressSpeech: false,
    },
    game: {
      id: 'undercover-host',
      gameType: 'undercover',
      mode: 'standard-6',
      status: 'speaking',
      round: 1,
      players: [],
      speeches: [],
    },
  });

  assert.equal(state.activeSpeech?.speakerRole, 'host');
  assert.equal(state.activeSpeech?.speakerLabel, '主持人');
  assert.equal(state.activeSpeech?.text, 'Round one begins.');
  assert.equal(state.activeSpeech?.playerId, null);
  assert.equal(state.host, null);

  const playerSpeech = feature.reduceUndercoverViewState(state, {
    type: 'undercover-speech',
    ackId: 10,
    channel: 'public',
    payload: { message: '1: Player speech.', round: 1, playerId: 1, text: 'Player speech.' },
    presentation: {
      speakableText: '1: Player speech.',
      displayText: '1: Player speech.',
      displayMode: 'status',
      uiHint: 'undercover-speech',
      suppressSpeech: false,
    },
    game: speakingGame(1),
  });
  assert.equal(playerSpeech.activeSpeech, null);
});

test('Undercover session errors clear active host narration', () => {
  const hookPath = require.resolve('../../packages/client/src/features/undercover/hooks/useUndercoverGame');
  const sessionModule = require('../../packages/client/src/hooks/useGameSocketSession') as {
    useGameSocketSession: (options: {
      applyServerEvent: (event: Record<string, unknown>) => void;
      onError: (error: Error) => void;
    }) => Record<string, unknown>;
  };
  const originalUseGameSocketSession = sessionModule.useGameSocketSession;
  let phase = 0;

  sessionModule.useGameSocketSession = (options) => {
    if (phase === 0) {
      phase = 1;
      options.applyServerEvent({
        type: 'undercover-round-start',
        ackId: 10,
        channel: 'public',
        payload: { message: 'host narration' },
        presentation: {
          speakableText: 'host narration',
          displayText: 'host narration',
          displayMode: 'status',
          uiHint: 'undercover-round-start',
          suppressSpeech: false,
        },
        game: {
          id: 'undercover-error',
          gameType: 'undercover',
          mode: 'standard-6',
          status: 'speaking',
          round: 1,
          players: [],
          speeches: [],
        },
      });
    } else if (phase === 1) {
      phase = 2;
      options.onError(new Error('session failed'));
    }
    return {
      autoPlay: true,
      isReplayMode: false,
      startSession: () => {},
      closeSession: () => {},
      clearPendingAckTimer: () => {},
      resetSessionRefs: () => {},
      setAutoPlayEnabled: () => {},
      skipCurrentReplayPhase: () => {},
    };
  };
  delete require.cache[hookPath];

  try {
    const feature = require(hookPath) as typeof import('../../packages/client/src/features/undercover/hooks/useUndercoverGame');
    function HookState() {
      const state = feature.useUndercoverGame({ playerIds: [] });
      return createElement('output', null, `${state.activeSpeech?.text || 'cleared'}|${state.error}`);
    }

    const markup = renderToStaticMarkup(createElement(HookState));
    assert.match(markup, /cleared\|session failed/);
    assert.doesNotMatch(markup, /host narration/);
  } finally {
    sessionModule.useGameSocketSession = originalUseGameSocketSession;
    delete require.cache[hookPath];
  }
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
