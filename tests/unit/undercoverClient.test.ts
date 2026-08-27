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

test('Undercover v2 renders host narration as the active subtitle', () => {
  const markup = renderToStaticMarkup(createElement(undercoverComponents.UndercoverArena, {
    game: { ...speakingGame(1), status: 'voting' },
    variant: 'v2',
    activeSpeech: {
      id: 'host-subtitle',
      playerId: null,
      text: '主持人宣布开始投票',
      speakerLabel: '主持人',
      speakerRole: 'host',
    },
  }));

  assert.match(markup, /主持人宣布开始投票/);
  assert.doesNotMatch(markup, /AI 玩家正在判断/);
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

  assert.match(classic, /class="undercover-controls game-control-rail"/);
  assert.match(classic, />返回选择</);
  assert.match(classic, /title="开始谁是卧底对局">开始游戏</);
  assert.match(classic, /title="暂停自动播放"[^>]*disabled=""/);
  assert.doesNotMatch(classic, /undercover-controls--v2/);
  assert.match(v2, /class="undercover-controls undercover-controls--v2 game-control-rail"/);
  assert.match(v2, />返回</);
  assert.doesNotMatch(v2, /title="暂停自动播放"/);
});

test('Undercover v2 pregame keeps classic marketing and v2 status gates separate', () => {
  const source = readFileSync(
    resolve('packages/client/src/features/undercover/UndercoverGame/index.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /\(variant === 'classic' \|\| !controller\.game\)/);
  assert.match(source, /\{variant === 'classic' && \(/);
  assert.match(
    source,
    /\{variant === 'v2' && <p className="undercover-status game-feedback" data-tone="info" aria-live="polite">\{controller\.message\}<\/p>\}/,
  );
  assert.equal(source.match(/role="alert"/g)?.length, 1);
});

test('Undercover debug controls stay in live v2 and default to 2x playback', () => {
  const source = readFileSync(
    resolve('packages/client/src/features/undercover/UndercoverGame/index.tsx'),
    'utf8',
  );
  assert.match(source, /const \[debugMode, setDebugMode\] = useState\(false\)/);
  assert.match(source, /debugMode: variant === 'v2' && !replayGameId && debugMode/);
  assert.match(source, /variant === 'v2' && !replayGameId && !controller\.started/);
  assert.match(source, /role="switch"[\s\S]*?调试模式/);
  assert.match(source, /variant === 'v2' && !replayGameId && debugMode && controller\.started/);
  assert.match(source, /调试中/);
  assert.match(source, /Match ID/);
  assert.match(source, /role="group"[\s\S]*?1×[\s\S]*?2×[\s\S]*?4×/);
});

test('Undercover playback callbacks isolate debug sessions and refresh after rate changes', () => {
  const harness = loadUndercoverGameHarness();
  const event: GameEvent = {
    type: 'undercover-round-start',
    presentation: {
      displayText: 'Round one begins.',
      speakableText: 'Round one begins.',
      displayMode: 'status',
      uiHint: 'undercover-round-start',
      suppressSpeech: false,
    },
  };
  const playerIds = [1, 2, 3, 4, 5, 6];

  try {
    let rendered = harness.render({ playerIds, debugMode: true });
    assert.equal(rendered.session.getSpeechOptions(event).playbackRate, 2);
    assert.equal(rendered.session.getAckDelay(event, ''), 60);

    rendered = harness.render({ playerIds });
    assert.equal(
      Object.hasOwn(rendered.session.getSpeechOptions(event), 'playbackRate'),
      false,
    );
    assert.equal(rendered.session.getAckDelay(event, ''), 120);

    rendered = harness.render({
      playerIds: [],
      replayGameId: 'undercover-history-1',
      debugMode: true,
    });
    assert.equal(
      Object.hasOwn(rendered.session.getSpeechOptions(event), 'playbackRate'),
      false,
    );
    assert.equal(rendered.session.getAckDelay(event, ''), 120);

    rendered = harness.render({ playerIds, debugMode: true });
    rendered.controller.setPlaybackRate(4);
    rendered = harness.render({ playerIds, debugMode: true });
    assert.equal(rendered.controller.playbackRate, 4);
    assert.equal(rendered.session.getSpeechOptions(event).playbackRate, 4);
    assert.equal(rendered.session.getAckDelay(event, ''), 60);
  } finally {
    harness.restore();
  }
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

test('Undercover v2 CSS defines side columns, one subtitle strip and a right control dock', () => {
  const arenaStyles = readFileSync(
    resolve('packages/client/src/features/undercover/components/UndercoverArena.css'),
    'utf8',
  );
  const shellStyles = readFileSync(
    resolve('packages/client/src/features/undercover/UndercoverGame/index.css'),
    'utf8',
  );
  const controlStyles = readFileSync(
    resolve('packages/client/src/features/undercover/components/UndercoverControls.css'),
    'utf8',
  );

  assert.equal(arenaStyles.match(/\.undercover-stage--v2\s*\{/g)?.length, 1);
  for (const seat of [1, 2, 3]) {
    assert.match(arenaStyles, new RegExp(`\\.undercover-stage--v2 \\.seat-${seat} \\{[^}]*left: 3%`, 's'));
  }
  for (const seat of [4, 5, 6]) {
    assert.match(arenaStyles, new RegExp(`\\.undercover-stage--v2 \\.seat-${seat} \\{[^}]*right: 3%`, 's'));
  }
  assert.match(arenaStyles, /\.undercover-stage--v2\.undercover-stage--speaking \.undercover-focus/);
  assert.match(
    arenaStyles,
    /\.undercover-stage--v2\.undercover-stage--speaking \.undercover-focus\s*\{[^}]*left: 39%[^}]*width: 38%/s,
  );
  assert.match(arenaStyles, /\.undercover-speaker-strip\s*\{[^}]*grid-template-columns:/s);
  assert.match(arenaStyles, /\.undercover-speaker-copy\s*\{[^}]*font-size: clamp\(20px,/s);
  assert.doesNotMatch(
    arenaStyles,
    /\.undercover-focus blockquote\s*\{[^}]*font-size:/s,
  );
  assert.doesNotMatch(
    arenaStyles,
    /\.undercover-stage--v2 \.undercover-player-name strong\s*\{[^}]*text-overflow:\s*ellipsis/s,
  );
  assert.match(controlStyles, /\.undercover-controls--v2\s*\{[^}]*right: clamp\(/s);
  assert.match(controlStyles, /\.undercover-controls--v2\s*\{[^}]*left: auto/s);
  assert.match(controlStyles, /\.undercover-controls--v2 button\s*\{[^}]*min-height: 44px/s);
  assert.match(
    shellStyles,
    /\.undercover-debug-panel\s*\{[^}]*position: fixed[^}]*z-index: 11[^}]*top: 16px[^}]*left: 20px[^}]*grid-template-columns: auto minmax\(0, 1fr\) auto[^}]*box-sizing: border-box[^}]*width: min\(600px, calc\(100vw - 40px\)\)/s,
  );
  assert.match(shellStyles, /\.undercover-debug-panel button\s*\{[^}]*min-height: 44px/s);
  assert.match(shellStyles, /\.undercover-debug-panel button:focus-visible/);
  assert.match(arenaStyles, /prefers-reduced-motion: reduce/);
});

test('game selection exposes an accessible Undercover player editor entry', () => {
  const source = readFileSync(resolve('packages/client/src/pages/GameSelectPage/index.tsx'), 'utf8');
  const catalog = readFileSync(resolve('packages/client/src/games/catalog.ts'), 'utf8');
  assert.match(catalog, /title: 'AI 谁是卧底'/);
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
  assert.deepEqual(
    feature!.buildUndercoverStartOptions([9, 4, 7, 2, 8, 1], '', true),
    { playerIds: [9, 4, 7, 2, 8, 1], debugMode: true },
  );
  assert.deepEqual(feature!.buildUndercoverStartOptions([], 'history-1'), { replayGameId: 'history-1' });
  assert.deepEqual(feature!.buildUndercoverStartOptions([], 'history-1', true), { replayGameId: 'history-1' });
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

test('Admin Undercover debug controls bind each action to a pending breakpoint', () => {
  const adminApi = readFileSync(resolve('packages/admin/src/services/adminApi.ts'), 'utf8');
  const consolePage = readFileSync(resolve('packages/admin/src/pages/WorkflowDebugConsole/index.tsx'), 'utf8');

  assert.match(adminApi, /export type UndercoverDebugAction = 'continue' \| 'skip' \| 'continuous';/);
  assert.match(
    adminApi,
    /controlUndercoverDebugMatch\(\s*matchId: string,\s*interruptId: string,\s*action: UndercoverDebugAction,?\s*\)[\s\S]*?`\/workflow\/matches\/\$\{encodeURIComponent\(matchId\)\}\/debug-control`[\s\S]*?method: 'POST',[\s\S]*?body: JSON\.stringify\(\{ interruptId, action \}\)/,
  );
  assert.match(consolePage, /match\?\.gameType === 'undercover' && matchConfig\.debugMode === true/);
  assert.match(consolePage, /interruptType === 'undercover_debug_breakpoint'[\s\S]*?status === 'pending'/);
  assert.match(consolePage, /controlUndercoverDebugMatch\(matchId, currentUndercoverBreakpointId, 'continue'\)/);
  assert.match(consolePage, /controlUndercoverDebugMatch\(matchId, currentUndercoverBreakpointId, 'skip'\)/);
  assert.match(consolePage, /controlUndercoverDebugMatch\(matchId, currentUndercoverBreakpointId, 'continuous'\)/);
  assert.match(consolePage, /继续一步/);
  assert.match(consolePage, /跳过当前步骤/);
  assert.match(consolePage, /连续运行/);
});

test('Admin hides generic interrupt actions for Undercover debug breakpoints', async () => {
  const harness = loadWorkflowDebugConsoleHarness({
    getWorkflowDebug: async () => ({
      match: { id: 'undercover-debug-match', gameType: 'undercover', config: { debugMode: true } },
      interrupts: [{
        id: 'undercover-debug-match:round_1_start:debug-breakpoint',
        interruptType: 'undercover_debug_breakpoint',
        status: 'pending',
        payload: { stepType: 'undercover.round_start' },
      }],
    }),
  });

  try {
    let tree = harness.render();
    findElement(tree, (element) => element.type === 'input' && element.props.placeholder === '输入 Match ID')
      .props.onChange({ target: { value: 'undercover-debug-match' } });
    tree = harness.render();
    await findElement(tree, (element) => element.type === 'button' && element.props.children === '加载').props.onClick();

    tree = harness.render();
    const tabs = findElement(tree, (element) => element.type === 'tabs');
    const items = tabs.props.items as Array<{ key: string; children: TestElement }>;
    const interrupts = items.find((item) => item.key === 'interrupts');
    assert.ok(interrupts);
    const columns = interrupts.children.props.columns as Array<{
      render?: (value: unknown, row: Record<string, unknown>) => unknown;
    }>;
    const renderActions = columns.at(-1)?.render;
    assert.ok(renderActions);
    assert.equal(renderActions(null, {
      id: 'undercover-debug-match:round_1_start:debug-breakpoint',
      interruptType: 'undercover_debug_breakpoint',
    }), null);
  } finally {
    harness.restore();
  }
});

test('Admin shows Undercover debug skip only for speech breakpoints', async () => {
  for (const [stepType, shouldShowSkip] of [
    ['undercover.round_start', false],
    ['undercover.result', false],
    ['undercover.speech', true],
  ] as const) {
    const harness = loadWorkflowDebugConsoleHarness({
      getWorkflowDebug: async () => ({
        match: { id: 'undercover-debug-match', gameType: 'undercover', config: { debugMode: true } },
        interrupts: [{
          id: `undercover-debug-match:${stepType}:debug-breakpoint`,
          interruptType: 'undercover_debug_breakpoint',
          status: 'pending',
          payload: { stepType },
        }],
      }),
    });

    try {
      let tree = harness.render();
      findElement(tree, (element) => element.type === 'input' && element.props.placeholder === '输入 Match ID')
        .props.onChange({ target: { value: 'undercover-debug-match' } });
      tree = harness.render();
      await findElement(tree, (element) => element.type === 'button' && element.props.children === '加载').props.onClick();

      tree = harness.render();
      assert.ok(findOptionalElement(tree, (element) => element.type === 'button' && element.props.children === '继续一步'));
      assert.ok(findOptionalElement(tree, (element) => element.type === 'button' && element.props.children === '连续运行'));
      assert.equal(
        Boolean(findOptionalElement(tree, (element) => element.type === 'button' && element.props.children === '跳过当前步骤')),
        shouldShowSkip,
      );
    } finally {
      harness.restore();
    }
  }
});

test('Admin Undercover debug controls disappear after the loaded match id is edited', async () => {
  const controlCalls: unknown[][] = [];
  const harness = loadWorkflowDebugConsoleHarness({
    getWorkflowDebug: async () => ({
      match: { id: 'undercover-debug-match', gameType: 'undercover', config: { debugMode: true } },
      interrupts: [{
        id: 'undercover-debug-match:round_1_start:debug-breakpoint',
        interruptType: 'undercover_debug_breakpoint',
        status: 'pending',
      }],
    }),
    controlUndercoverDebugMatch: (...args: unknown[]) => {
      controlCalls.push(args);
      return Promise.resolve({});
    },
  });

  try {
    let tree = harness.render();
    findElement(tree, (element) => element.type === 'input' && element.props.placeholder === '输入 Match ID')
      .props.onChange({ target: { value: 'undercover-debug-match' } });
    tree = harness.render();
    await findElement(tree, (element) => element.type === 'button' && element.props.children === '加载').props.onClick();

    tree = harness.render();
    assert.ok(findOptionalElement(tree, (element) => element.type === 'button' && element.props.children === '继续一步'));

    findElement(tree, (element) => element.type === 'input' && element.props.placeholder === '输入 Match ID')
      .props.onChange({ target: { value: 'another-match' } });
    tree = harness.render();

    assert.equal(findOptionalElement(tree, (element) => element.type === 'button' && element.props.children === '继续一步'), undefined);
    assert.deepEqual(controlCalls, []);
  } finally {
    harness.restore();
  }
});

type GameEvent = import('../../packages/client/src/types').GameEvent;
type QueueItem = import('../../packages/client/src/types').QueueItem;

interface UndercoverSessionCallbacks {
  getSpeechOptions: (event: GameEvent) => Partial<QueueItem>;
  getAckDelay: (event: GameEvent, narration: string) => number;
}

function loadUndercoverGameHarness() {
  const hookPath = require.resolve(
    '../../packages/client/src/features/undercover/hooks/useUndercoverGame',
  );
  const sessionPath = require.resolve('../../packages/client/src/hooks/useGameSocketSession');
  const speechPath = require.resolve('../../packages/client/src/hooks/useSpeechQueue');
  const reactPath = require.resolve('../../packages/client/node_modules/react');
  const originalHookModule = require.cache[hookPath];
  const originalSessionExports = require(sessionPath);
  const originalSpeechExports = require(speechPath);
  const originalReactExports = require(reactPath);
  const state: unknown[] = [];
  let stateCursor = 0;
  let latestSession: UndercoverSessionCallbacks | null = null;

  require.cache[reactPath]!.exports = {
    ...originalReactExports,
    useEffect() {},
    useState<T>(initialValue: T) {
      const index = stateCursor++;
      if (!(index in state)) state[index] = initialValue;
      return [
        state[index] as T,
        (nextValue: T | ((currentValue: T) => T)) => {
          state[index] = typeof nextValue === 'function'
            ? (nextValue as (currentValue: T) => T)(state[index] as T)
            : nextValue;
        },
      ] as const;
    },
  };
  require.cache[sessionPath]!.exports = {
    ...originalSessionExports,
    useGameSocketSession(options: UndercoverSessionCallbacks) {
      latestSession = options;
      return {
        autoPlay: true,
        isReplayMode: false,
        startSession() {},
        closeSession() {},
        clearPendingAckTimer() {},
        resetSessionRefs() {},
        setAutoPlayEnabled() {},
        skipCurrentReplayPhase() {},
      };
    },
  };
  require.cache[speechPath]!.exports = {
    ...originalSpeechExports,
    useSpeechQueue() {
      return {
        speechEnabled: true,
        setSpeechEnabled() {},
        speak() {
          return true;
        },
        unlock() {},
        cancel() {},
      };
    },
  };
  delete require.cache[hookPath];
  const hookModule = require(hookPath) as typeof import('../../packages/client/src/features/undercover/hooks/useUndercoverGame');

  return {
    render(params: Parameters<typeof hookModule.useUndercoverGame>[0]) {
      stateCursor = 0;
      latestSession = null;
      const controller = hookModule.useUndercoverGame(params);
      assert.ok(latestSession);
      return { controller, session: latestSession };
    },
    restore() {
      require.cache[reactPath]!.exports = originalReactExports;
      require.cache[sessionPath]!.exports = originalSessionExports;
      require.cache[speechPath]!.exports = originalSpeechExports;
      if (originalHookModule) require.cache[hookPath] = originalHookModule;
      else delete require.cache[hookPath];
    },
  };
}

interface TestElement {
  type: unknown;
  props: Record<string, unknown>;
}

function loadWorkflowDebugConsoleHarness(api: Record<string, (...args: never[]) => unknown>) {
  const pagePath = resolve('packages/admin/src/pages/WorkflowDebugConsole/index.tsx');
  const adminApiPath = resolve('packages/admin/src/services/adminApi.ts');
  const reactPath = require.resolve('../../packages/admin/node_modules/react');
  const antdPath = require.resolve('../../packages/admin/node_modules/antd');
  const originalPage = require.cache[pagePath];
  const originalAdminApi = require(adminApiPath);
  const originalReact = require(reactPath);
  const originalAntd = require.cache[antdPath];
  const state: unknown[] = [];
  let cursor = 0;

  require.cache[adminApiPath]!.exports = { ...originalAdminApi, ...api };
  require.cache[reactPath]!.exports = {
    ...originalReact,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
    useMemo(factory: () => unknown) {
      return factory();
    },
  };
  require.cache[antdPath] = { exports: createAntdTestStubs() } as NodeModule;
  const { WorkflowDebugConsole } = requireWorkflowDebugConsole(pagePath);

  return {
    render(): TestElement {
      cursor = 0;
      return WorkflowDebugConsole();
    },
    restore(): void {
      require.cache[adminApiPath]!.exports = originalAdminApi;
      require.cache[reactPath]!.exports = originalReact;
      if (originalAntd) require.cache[antdPath] = originalAntd;
      else delete require.cache[antdPath];
      if (originalPage) require.cache[pagePath] = originalPage;
      else delete require.cache[pagePath];
    },
  };
}

function requireWorkflowDebugConsole(pagePath: string): { WorkflowDebugConsole: () => TestElement } {
  const Module = require('node:module');
  const ts = require('../../packages/server/node_modules/typescript') as typeof import('typescript');
  const originalTsLoader = Module._extensions['.ts'];
  const originalTsxLoader = Module._extensions['.tsx'];
  const loadTypeScript = (module: NodeModule, filename: string) => {
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };

  Module._extensions['.ts'] = loadTypeScript;
  Module._extensions['.tsx'] = loadTypeScript;
  delete require.cache[pagePath];
  try {
    return require(pagePath) as { WorkflowDebugConsole: () => TestElement };
  } finally {
    if (originalTsLoader) Module._extensions['.ts'] = originalTsLoader;
    else delete Module._extensions['.ts'];
    if (originalTsxLoader) Module._extensions['.tsx'] = originalTsxLoader;
    else delete Module._extensions['.tsx'];
  }
}

function createAntdTestStubs() {
  const Form = Object.assign(() => null, { Item: () => null, useForm: () => [{}] });
  const Space = Object.assign(() => null, { Compact: () => null });
  return {
    Alert: 'alert',
    Button: 'button',
    Card: 'card',
    Col: 'col',
    Form,
    Input: 'input',
    InputNumber: 'input-number',
    Modal: 'modal',
    Row: 'row',
    Space,
    Table: 'table',
    Tabs: 'tabs',
    Tag: 'tag',
    Typography: { Text: 'text', Paragraph: 'paragraph' },
    message: { error: () => {}, success: () => {} },
  };
}

function findElement(tree: unknown, predicate: (element: TestElement) => boolean): TestElement {
  const element = findOptionalElement(tree, predicate);
  assert.ok(element, 'expected element was not rendered');
  return element;
}

function findOptionalElement(tree: unknown, predicate: (element: TestElement) => boolean): TestElement | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const element = findOptionalElement(child, predicate);
      if (element) return element;
    }
    return undefined;
  }
  if (!tree || typeof tree !== 'object' || !('props' in tree)) return undefined;
  const element = tree as TestElement;
  if (predicate(element)) return element;
  return findOptionalElement(element.props.children, predicate);
}
