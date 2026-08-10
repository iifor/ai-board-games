import assert from 'node:assert/strict';
import test from 'node:test';
import { BasePlayerAgent } from '../../packages/server/modules/agent-core/playerAgent';
import { getGameEngine, resetGameEngine } from '../../packages/server/modules/engine-registry';
import { resolveGameRunner } from '../../packages/server/modules/game-socket/gameRunner';
import { runSession, selectPlayersForGame } from '../../packages/server/modules/game-socket/service';
import { buildUndercoverDebugSpeech, buildUndercoverDebugVote } from '../../packages/server/modules/undercover/debug';
import { createInitialUndercoverState, validatePublicSpeech } from '../../packages/server/modules/undercover/rules';
import {
  getStepHandler,
  getWorkflow,
} from '../../packages/server/modules/workflow-engine';
import {
  UNDERCOVER_WORKFLOW_ID,
  registerUndercoverWorkflow,
} from '../../packages/server/modules/undercover/workflow';
import {
  normalizeGameType,
  validatePlayerSelection,
} from '../../packages/server/routes/gameRoutes';

test('undercover debug generation is deterministic and legal', () => {
  const players = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    nickname: `${index + 1}号`,
    avatar: '',
  }));
  const state = createInitialUndercoverState(players, {
    seed: 42,
    wordPair: { civilian: '咖啡', undercover: '奶茶' },
    undercoverPlayerId: 2,
  });
  state.round = 2;

  const first = buildUndercoverDebugSpeech(state, 1);
  const second = buildUndercoverDebugSpeech(state, 1);
  assert.deepEqual(second, first);
  assert.equal(validatePublicSpeech(first.speech, state.wordPair).ok, true);

  const vote = buildUndercoverDebugVote(state, 1, [2, 3, 4], false);
  assert.equal([2, 3, 4].includes(vote.targetId), true);
});

test('undercover debug speech rejects a fallback that leaks a secret word', () => {
  const players = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    nickname: `${index + 1}号`,
    avatar: '',
  }));
  const state = createInitialUndercoverState(players, {
    seed: 42,
    wordPair: { civilian: '生活', undercover: '奶茶' },
    undercoverPlayerId: 2,
  });
  state.round = 2;

  assert.throws(
    () => buildUndercoverDebugSpeech(state, 1),
    /cannot produce public speech/,
  );
});

test('registered undercover resolves through generic runtime metadata', () => {
  resetGameEngine();
  const resolved = resolveGameRunner('undercover');

  assert.equal(resolved.gameType, 'undercover');
  assert.equal(resolved.session.startMessage, '谁是卧底开始');
  assert.equal(resolved.session.doneMessage, '谁是卧底结束，身份已经揭晓。');
  assert.equal(typeof resolved.run, 'function');
});

test('unknown games fail instead of falling back to werewolf', () => {
  resetGameEngine();

  assert.throws(() => resolveGameRunner('not-a-game'), /GameDefinition not registered/);
});

test('public validation accepts every registered game definition', () => {
  assert.equal(normalizeGameType('debate'), 'debate');
  assert.equal(normalizeGameType('werewolf'), 'werewolf');
  assert.equal(normalizeGameType('undercover'), 'undercover');
  assert.throws(() => normalizeGameType('unknown-game'), /未知游戏类型/);
});

test('public player selection uses definition metadata', () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

  assert.doesNotThrow(() => validatePlayerSelection('debate', ids(8)));
  assert.throws(() => validatePlayerSelection('debate', ids(7)), /8-12/);
  assert.doesNotThrow(() => validatePlayerSelection('werewolf', ids(12)));
  assert.throws(() => validatePlayerSelection('werewolf', ids(11)), /12/);
  assert.doesNotThrow(() => validatePlayerSelection('undercover', ids(6)));
  assert.throws(() => validatePlayerSelection('undercover', ids(5)), /6/);
});

test('registered player selection metadata validates undercover without a game branch', async () => {
  resetGameEngine();
  const players = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 }));

  await assert.rejects(
    selectPlayersForGame(
      { host: {}, players, missingProviders: [] },
      players.map((player) => player.id),
      'undercover',
    ),
    /AI 谁是卧底需要选择恰好 6 位 AI 玩家/,
  );
});

test('legacy runners preserve definition-backed session metadata', () => {
  resetGameEngine();

  const debate = resolveGameRunner('debate');
  assert.equal(debate.session.startMessage, '辩论赛开始');
  assert.equal(debate.session.doneMessage, '辩论赛结束，完整赛果已生成。');
  assert.deepEqual(debate.session.playback, { phaseLookahead: 1 });

  const werewolf = resolveGameRunner('werewolf');
  assert.equal(werewolf.session.startMessage, '游戏开始');
  assert.equal(werewolf.session.doneMessage, '狼人杀结束，完整战报已生成。');
  assert.deepEqual(werewolf.session.playback, { prefetchCount: 2 });
});

test('debug Undercover completes its first speech without calling the player model', async (t) => {
  registerUndercoverWorkflow();
  const workflowRepository = require('../../packages/server/modules/workflow-engine/repository') as {
    listAiTasks: (matchId: string) => Promise<Array<Record<string, unknown>>>;
  };
  const originalListAiTasks = workflowRepository.listAiTasks;
  const originalAskJson = BasePlayerAgent.prototype.askJson;
  const players = Array.from({ length: 6 }, (_, index) => ({
    id: index + 101,
    nickname: `${index + 1}号`,
    avatar: '',
  }));
  const state = {
    ...createInitialUndercoverState(players, {
      seed: 42,
      wordPair: { civilian: '咖啡', undercover: '奶茶' },
      undercoverPlayerId: 102,
    }),
    completedSteps: {},
    round: 1,
  };
  const match = {
    id: 'undercover-debug-unit',
    config: { debugMode: true },
    state,
  };
  const step = {
    id: 'round_1_speech_0',
    type: 'undercover.speech',
    config: { round: 1, orderIndex: 0 },
  };
  const task = {
    id: 'undercover-debug-unit:round_1_speech_0:speech:101',
    matchId: match.id,
    stepId: step.id,
    taskKey: 'speech:101',
    playerId: 101,
    action: 'undercover_speech',
    status: 'queued',
    promptContextSnapshot: { actorId: 101, round: 1 },
  };
  const handler = getStepHandler(UNDERCOVER_WORKFLOW_ID, step.type);
  const workflow = getWorkflow(UNDERCOVER_WORKFLOW_ID);
  let askJsonCalls = 0;
  BasePlayerAgent.prototype.askJson = async () => {
    askJsonCalls += 1;
    throw new Error('debug Undercover must not call the player model');
  };
  t.after(() => {
    workflowRepository.listAiTasks = originalListAiTasks;
    BasePlayerAgent.prototype.askJson = originalAskJson;
  });
  const result = await handler.runAiTask!({
    match,
    workflow,
    step,
    task,
  });
  workflowRepository.listAiTasks = async () => [{
    ...task,
    status: 'succeeded',
    result,
  }];

  const completed = await handler.execute({
    match,
    workflow,
    step,
    state,
  });
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.events?.[0]?.type, 'undercover-speech');
  assert.equal((completed.state?.speeches as unknown[]).length, 1);
  assert.equal((completed.state?.completedSteps as Record<string, boolean>)[step.id], true);
  assert.equal(askJsonCalls, 0);
});

test('runSession persists the start before every runtime event while live playback is delayed', async (t) => {
  resetGameEngine();
  const firstDisplayStarted = deferred<void>();
  const releasePlayback = deferred<void>();
  const savedRecord = deferred<Record<string, unknown>>();
  const gameType = 'delayed-playback-fixture';
  const firstRuntimeEvent = createRuntimeEvent('fixture-first', 'first narration');
  const finalRuntimeEvent = createRuntimeEvent('fixture-final-result', 'final result narration');
  getGameEngine().registerDefinition({
    gameType,
    version: '1.0.0',
    workflowId: 'delayed-playback-fixture-v1',
    actionSchemas: {},
    metadata: {
      session: {
        startMessage: 'fixture start',
        doneMessage: 'fixture done',
        playerSelection: { min: 1, max: 1, errorMessage: 'select one fixture player' },
        playback: { prefetchCount: 1 },
      },
    },
    runtime: {
      createMatch: () => ({ id: 'delayed-playback-match' }),
      run: async (_matchId, context) => {
        context?.onEvent?.(firstRuntimeEvent);
        await firstDisplayStarted.promise;
        context?.onEvent?.(finalRuntimeEvent);
        return {
          id: 'delayed-playback-match',
          gameType,
          players: [{ id: 201, nickname: 'fixture player' }],
          winner: 'fixture',
        };
      },
    },
  });

  const aiConfigModule = require('../../packages/server/config/ai') as { getAiConfig: () => unknown };
  const settingsModule = require('../../packages/server/modules/settings/service') as { getSpectatorMode: () => boolean };
  const gamesModule = require('../../packages/server/modules/games/service') as { saveGameRecord: (game: unknown) => unknown };
  const originalGetAiConfig = aiConfigModule.getAiConfig;
  const originalGetSpectatorMode = settingsModule.getSpectatorMode;
  const originalSaveGameRecord = gamesModule.saveGameRecord;
  aiConfigModule.getAiConfig = () => ({
    host: { id: 0, name: 'host', nickname: 'host' },
    players: [{ id: 201, name: 'fixture player', nickname: 'fixture player', provider: 'test' }],
    missingProviders: [],
    realReady: true,
  });
  settingsModule.getSpectatorMode = () => false;
  gamesModule.saveGameRecord = (game) => {
    savedRecord.resolve(game as Record<string, unknown>);
    return [];
  };
  t.after(() => {
    releasePlayback.resolve();
    aiConfigModule.getAiConfig = originalGetAiConfig;
    settingsModule.getSpectatorMode = originalGetSpectatorMode;
    gamesModule.saveGameRecord = originalSaveGameRecord;
    resetGameEngine();
  });

  const sent: Record<string, unknown>[] = [];
  let closed = false;
  const session = {
    send(payload: Record<string, unknown>) { sent.push(payload); },
    async sendAndWait(payload: Record<string, unknown>) {
      sent.push(payload);
      firstDisplayStarted.resolve();
      await releasePlayback.promise;
    },
    resolveAck() {},
    close() { closed = true; },
    setPaused() {},
    skipCurrentPhase() {},
  };

  const running = runSession(session as never, 'real', [201], gameType);
  const saved = await savedRecord.promise;
  assert.equal(closed, false);
  releasePlayback.resolve();
  await running;

  const playbackEvents = saved.playbackEvents as Array<{ payload: Record<string, unknown> }>;
  assert.deepEqual(
    playbackEvents.map((event) => event.payload.type),
    ['host', 'fixture-first', 'fixture-final-result', 'done'],
  );
  assert.equal(playbackEvents[0].payload.message, 'fixture start');
  assert.equal(playbackEvents[2].payload.message, 'final result narration');
  assert.equal(sent.filter((event) => event.type === 'host').length, 1);
  assert.equal(closed, true);
});

for (const status of ['failed', 'paused_debug']) {
  test(`runSession does not save or emit done for a ${status} Undercover match`, async (t) => {
    resetGameEngine();
    const gameType = `undercover-${status}-fixture`;
    const failureMessage = `谁是卧底工作流异常停止（${status}）：injected ${status}`;
    getGameEngine().registerDefinition({
      gameType,
      version: '1.0.0',
      workflowId: `${gameType}-v1`,
      actionSchemas: {},
      metadata: {
        session: {
          startMessage: '谁是卧底开始',
          doneMessage: '谁是卧底结束，身份已经揭晓。',
          playerSelection: { min: 1, max: 1, errorMessage: 'select one fixture player' },
        },
      },
      runtime: {
        createMatch: () => ({ id: `${gameType}-match` }),
        run: async () => { throw new Error(failureMessage); },
      },
    });
    const players = createSocketPlayers();
    const aiConfigModule = require('../../packages/server/config/ai') as { getAiConfig: () => unknown };
    const settingsModule = require('../../packages/server/modules/settings/service') as { getSpectatorMode: () => boolean };
    const gamesModule = require('../../packages/server/modules/games/service') as { saveGameRecord: (game: unknown) => unknown };
    const originalGetAiConfig = aiConfigModule.getAiConfig;
    const originalGetSpectatorMode = settingsModule.getSpectatorMode;
    const originalSaveGameRecord = gamesModule.saveGameRecord;
    let saveCalls = 0;
    aiConfigModule.getAiConfig = () => ({
      host: { id: 0, name: '主持人', nickname: '主持人' },
      players,
      missingProviders: [],
      realReady: true,
    });
    settingsModule.getSpectatorMode = () => false;
    gamesModule.saveGameRecord = () => {
      saveCalls += 1;
      return [];
    };
    t.after(() => {
      aiConfigModule.getAiConfig = originalGetAiConfig;
      settingsModule.getSpectatorMode = originalGetSpectatorMode;
      gamesModule.saveGameRecord = originalSaveGameRecord;
      resetGameEngine();
    });

    const sent: Record<string, unknown>[] = [];
    const session = {
      send(payload: Record<string, unknown>) { sent.push(payload); },
      async sendAndWait(payload: Record<string, unknown>) { sent.push(payload); },
      resolveAck() {},
      close() {},
      setPaused() {},
      skipCurrentPhase() {},
    };
    let failure = '';
    try {
      await runSession(
        session as never,
        'real',
        [players[0].id],
        gameType,
      );
    } catch (error) {
      failure = (error as Error).message;
    }

    assert.deepEqual({
      failure,
      saveCalls,
      doneEvents: sent.filter((event) => event.type === 'done').length,
    }, {
      failure: failureMessage,
      saveCalls: 0,
      doneEvents: 0,
    });
  });
}

function createRuntimeEvent(type: string, message: string): Record<string, unknown> {
  return {
    type,
    message,
    presentation: {
      speakableText: message,
      displayText: message,
      displayMode: 'status',
      suppressSpeech: false,
      requiresAck: true,
    },
  };
}

function createSocketPlayers() {
  return Array.from({ length: 6 }, (_, index) => ({
    id: index + 301,
    name: `${index + 1}号`,
    nickname: `${index + 1}号`,
    avatar: '',
    avatarUrl: '',
    provider: 'test',
    providerName: 'test',
    baseUrl: 'https://undercover.test/v1',
    apiKeyEnv: 'TEST_KEY',
    apiKey: 'test-key',
    apiFormat: 'openai-compatible',
    model: 'test-model',
    modelId: 1,
    temperature: 0.5,
    personality: '测试玩家',
    sex: '未知',
    voicePackageId: null,
    thinkingEnabled: false,
    fallbackModel: null,
  }));
}

function deferred<T>() {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done as (value?: T | PromiseLike<T>) => void;
  });
  return { promise, resolve };
}
