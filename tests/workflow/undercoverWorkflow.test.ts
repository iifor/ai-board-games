import assert from 'node:assert/strict';
import test from 'node:test';
import type { AiConfig } from '../../packages/server/config/ai';
import { BasePlayerAgent } from '../../packages/server/modules/agent-core/playerAgent';
import { flushTrace, getActiveTrace, markTraceError } from '../../packages/server/modules/observability';
import { UNDERCOVER_WORD_PAIRS } from '../../packages/server/modules/undercover/rules';
import {
  createUndercoverWorkflowMatch,
  registerUndercoverWorkflow,
  runUndercoverWorkflow,
} from '../../packages/server/modules/undercover/workflow';
import { claimNextAiTask, completeAiTask, getDebugState } from '../../packages/server/modules/workflow-engine';

function createDebugMatch() {
  return createUndercoverWorkflowMatch({
    selectedPlayerIds: [1, 2, 3, 4, 5, 6],
    debugMode: true,
    debug: { seed: 7, civilianWord: '咖啡', undercoverWord: '茶', undercoverPlayerId: 6 },
    players: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nickname: `${index + 1}号` })),
  });
}

test('undercover workflow completes a civilian win and persists public events', () => {
  registerUndercoverWorkflow();
  const match = createDebugMatch();

  for (let guard = 0; guard < 80; guard += 1) {
    const current = getDebugState(match.id).match;
    if (current.status === 'completed') break;
    const task = claimNextAiTask({ matchId: match.id, workerId: 'undercover-test' });
    assert.ok(task, `expected queued task at ${current.currentStepIndex}`);
    const payload = task.action === 'undercover_speech'
      ? { action: task.action, speech: '常见描述' }
      : { action: task.action, targetId: Number(task.playerId) === 6 ? 1 : 6, reason: '测试票' };
    completeAiTask(task.id, { eventType: 'ai_task_succeeded', payload });
  }

  const completed = getDebugState(match.id);
  assert.equal(completed.match.status, 'completed');
  assert.equal(completed.match.state.winner, 'civilians');
  assert.doesNotMatch(JSON.stringify(completed.events.filter((event) => event.visibility !== 'system').slice(0, -1)), /咖啡|茶|undercoverPlayerId/);
});

test('persisted speech results are leak-guarded before public emission', () => {
  const match = createDebugMatch();
  const task = claimNextAiTask({ matchId: match.id, workerId: 'undercover-leak-test' });
  assert.equal(task?.action, 'undercover_speech');
  completeAiTask(task!.id, { payload: { action: task!.action, speech: '我喜欢咖啡' } });

  const current = getDebugState(match.id);
  assert.equal(current.match.state.speeches[0].text, '这个事物在生活中并不少见');
  assert.doesNotMatch(JSON.stringify(current.events.filter((event) => event.visibility === 'public')), /咖啡|茶/);
});

test('persisted ballots are omitted from the public vote result', () => {
  const match = createDebugMatch();
  for (let index = 0; index < 6; index += 1) {
    const task = claimNextAiTask({ matchId: match.id, workerId: 'undercover-ballot-test' });
    assert.equal(task?.action, 'undercover_speech');
    completeAiTask(task!.id, { payload: { action: task!.action, speech: '常见描述' } });
  }
  for (let index = 0; index < 6; index += 1) {
    const task = claimNextAiTask({ matchId: match.id, workerId: 'undercover-ballot-test' });
    assert.equal(task?.action, 'undercover_vote');
    completeAiTask(task!.id, { payload: { action: task!.action, targetId: Number(task!.playerId), reason: '自投' } });
  }

  const current = getDebugState(match.id);
  const voteEvent = current.events.find((event) => event.type === 'undercover-vote-result');
  const publicPayload = (voteEvent?.payload as { payload?: Record<string, unknown> })?.payload || {};
  assert.equal('votes' in publicPayload, false);
});

test('production match rejects custom words and uses only the approved list', () => {
  const players = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nickname: `${index + 1}号` }));
  assert.throws(() => createUndercoverWorkflowMatch({
    players,
    debugMode: false,
    debug: { seed: 7, civilianWord: '未审核词甲', undercoverWord: '未审核词乙' },
  }), /debugMode/);

  const approved = createUndercoverWorkflowMatch({ players, debugMode: false, debug: { seed: 7 } });
  const pair = getDebugState(approved.id).match.state.wordPair;
  assert.ok(UNDERCOVER_WORD_PAIRS.some((candidate) => candidate.civilian === pair.civilian && candidate.undercover === pair.undercover));
});

test('runtime applies one askJson call per invalid AI task and delivers outbox events', async (t) => {
  let calls = 0;
  const originalAskJson = BasePlayerAgent.prototype.askJson;
  BasePlayerAgent.prototype.askJson = async function (_prompt, options) {
    calls += 1;
    const value = options.phase === 'speech'
      ? { speech: '' }
      : { targetId: Number(this.player.id), reason: '自投' };
    return options.schema?.safeParse(value).success ? value : null;
  };
  t.after(() => { BasePlayerAgent.prototype.askJson = originalAskJson; });

  const players = configuredPlayers(t);
  const match = createUndercoverWorkflowMatch({ players, debugMode: false, debug: { seed: 7 } });
  t.after(() => cleanupTrace(match.id));
  const delivered: Record<string, unknown>[] = [];
  await runUndercoverWorkflow(match.id, { onEvent: (event) => { delivered.push(event); } });

  const completed = getDebugState(match.id);
  assert.equal(completed.match.status, 'completed');
  assert.equal(calls, completed.aiTasks.length);
  assert.ok(completed.match.state.speeches.every((speech: { text: string }) => speech.text === '这个事物在生活中并不少见'));
  assert.ok(delivered.length > 0);
  assert.ok(completed.outbox.every((message) => message.status === 'sent'));
});

test('successful runtime finalizes its trace after outbox delivery', async (t) => {
  const originalAskJson = BasePlayerAgent.prototype.askJson;
  t.after(() => { BasePlayerAgent.prototype.askJson = originalAskJson; });

  const players = configuredPlayers(t);
  const undercoverId = players[5].id;
  BasePlayerAgent.prototype.askJson = async function (_prompt, options) {
    return options.phase === 'speech'
      ? { speech: '常见描述' }
      : { targetId: Number(this.player.id) === undercoverId ? players[0].id : undercoverId, reason: '测试票' };
  };
  const match = createUndercoverWorkflowMatch({ players, debugMode: false, debug: { seed: 7, undercoverPlayerId: undercoverId } });
  const delivered: Record<string, unknown>[] = [];
  try {
    await runUndercoverWorkflow(match.id, { onEvent: (event) => { delivered.push(event); } });
    assert.equal(getDebugState(match.id).match.status, 'completed');
    assert.ok(delivered.length > 0);
    assert.equal(getActiveTrace(match.id), null);
  } finally {
    cleanupTrace(match.id);
  }
});

function configuredPlayers(t: { after(callback: () => void): void }) {
  const aiConfigModule = require('../../packages/server/config/ai') as { getAiConfig: () => AiConfig };
  const originalGetAiConfig = aiConfigModule.getAiConfig;
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
  const baseConfig = originalGetAiConfig();
  aiConfigModule.getAiConfig = () => ({ ...baseConfig, players, realReady: true, missingProviders: [] });
  t.after(() => { aiConfigModule.getAiConfig = originalGetAiConfig; });
  return players.map((player) => ({
    id: Number(player.id),
    nickname: player.nickname,
    avatar: player.avatar,
  }));
}

function cleanupTrace(matchId: string): void {
  const danglingTrace = getActiveTrace(matchId);
  if (!danglingTrace) return;
  markTraceError(danglingTrace, 'test cleanup');
  flushTrace(danglingTrace);
}
