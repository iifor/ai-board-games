import assert from 'node:assert/strict';
import test from 'node:test';
import { BasePlayerAgent } from '../../packages/server/modules/agent-core/playerAgent';
import { resetGameEngine } from '../../packages/server/modules/engine-registry';
import { resolveGameRunner } from '../../packages/server/modules/game-socket/gameRunner';
import { runSession, selectPlayersForGame } from '../../packages/server/modules/game-socket/service';

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

test('registered player selection metadata validates undercover without a game branch', () => {
  resetGameEngine();
  const players = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 }));

  assert.throws(
    () => selectPlayersForGame(
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

test('runSession delivers definition-backed Undercover start once and completes the generic runtime', async (t) => {
  resetGameEngine();
  const aiConfigModule = require('../../packages/server/config/ai') as { getAiConfig: () => unknown };
  const settingsModule = require('../../packages/server/modules/settings/service') as { getSpectatorMode: () => boolean };
  const originalGetAiConfig = aiConfigModule.getAiConfig;
  const originalGetSpectatorMode = settingsModule.getSpectatorMode;
  const originalAskJson = BasePlayerAgent.prototype.askJson;
  const players = Array.from({ length: 6 }, (_, index) => ({
    id: index + 101,
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
  aiConfigModule.getAiConfig = () => ({
    rounds: 3,
    host: { id: 0, name: '主持人', nickname: '主持人' },
    players,
    missingProviders: [],
    realReady: true,
  });
  settingsModule.getSpectatorMode = () => false;
  BasePlayerAgent.prototype.askJson = async () => null;
  t.after(() => {
    aiConfigModule.getAiConfig = originalGetAiConfig;
    settingsModule.getSpectatorMode = originalGetSpectatorMode;
    BasePlayerAgent.prototype.askJson = originalAskJson;
  });

  const sent: Record<string, unknown>[] = [];
  let closed = false;
  const session = {
    send(payload: Record<string, unknown>) { sent.push(payload); },
    async sendAndWait(payload: Record<string, unknown>) { sent.push(payload); },
    resolveAck() {},
    close() { closed = true; },
    setPaused() {},
    skipCurrentPhase() {},
  };

  await runSession(
    session as never,
    'real',
    players.map((player) => player.id),
    'undercover',
    { debugMode: true },
  );

  const starts = sent.filter((event) => event.message === '谁是卧底开始');
  assert.equal(starts.length, 1);
  assert.equal(starts[0].type, 'host');
  assert.equal((starts[0].game as Record<string, unknown>).type, 'undercover');
  const completed = sent.find((event) => event.type === 'done');
  assert.equal(completed?.message, '谁是卧底结束，身份已经揭晓。');
  assert.equal((completed?.game as Record<string, unknown>).gameType, 'undercover');
  assert.equal(closed, true);
});
