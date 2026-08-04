import assert from 'node:assert/strict';
import test from 'node:test';
import type { AiConfig } from '../../packages/server/config/ai';
import { BasePlayerAgent } from '../../packages/server/modules/agent-core/playerAgent';
import { flushTrace, getActiveTrace, markTraceError } from '../../packages/server/modules/observability';
import { UNDERCOVER_WORD_PAIRS, seededIndex } from '../../packages/server/modules/undercover/rules';
import {
  createUndercoverWorkflowMatch,
  undercoverWorkflow,
  registerUndercoverWorkflow,
  runUndercoverWorkflow,
  type UndercoverRuntimeConfig,
} from '../../packages/server/modules/undercover/workflow';
import {
  claimNextAiTask,
  commitWorkflowChange,
  completeAiTask,
  controlUndercoverDebugMatch,
  createWorkflowMatch,
  getDebugState,
  repository,
  registerWorkflow,
  wakeTick,
} from '../../packages/server/modules/workflow-engine';
import { evaluateDebugBreakpoint } from '../../packages/server/modules/workflow-engine/debugBreakpoint';

function createDebugMatch() {
  return createUndercoverWorkflowMatch({
    selectedPlayerIds: [1, 2, 3, 4, 5, 6],
    debugMode: true,
    debug: { seed: 7, civilianWord: '咖啡', undercoverWord: '茶', undercoverPlayerId: 6 },
    players: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nickname: `${index + 1}号` })),
  });
}

function createBreakpointMatch() {
  return createUndercoverWorkflowMatch({
    players: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nickname: `${index + 1}号` })),
    debugMode: true,
    debug: { seed: 42, civilianWord: '咖啡', undercoverWord: '奶茶', undercoverPlayerId: 2 },
  });
}

function pendingBreakpointId(matchId: string): string {
  const interrupt = getDebugState(matchId)!.interrupts.find((item) =>
    item.interruptType === 'undercover_debug_breakpoint' && item.status === 'pending'
  );
  assert.ok(interrupt);
  return interrupt.id;
}

function controlBreakpoint(matchId: string, action: 'continue' | 'skip' | 'continuous') {
  return controlUndercoverDebugMatch({
    matchId,
    interruptId: pendingBreakpointId(matchId),
    action,
  });
}

test('undercover debug match pauses once at each marked step', () => {
  const match = createBreakpointMatch();

  const ready = getDebugState(match.id)!;
  const pending = ready.interrupts.filter((item) =>
    item.interruptType === 'undercover_debug_breakpoint' && item.status === 'pending'
  );
  assert.equal(pending.length, 1);
  assert.equal(pending[0].stepId, 'round_1_start');

  controlBreakpoint(match.id, 'continue');
  const advanced = getDebugState(match.id)!;
  assert.equal(advanced.interrupts.filter((item) => item.stepId === 'round_1_start').length, 1);
  assert.equal(
    advanced.interrupts.filter((item) =>
      item.interruptType === 'undercover_debug_breakpoint' && item.status === 'pending'
    ).length,
    1,
  );
});

test('undercover debug skip records one system event and moves past a speech step', () => {
  const match = createBreakpointMatch();
  controlBreakpoint(match.id, 'continue');

  controlBreakpoint(match.id, 'skip');

  const current = getDebugState(match.id)!;
  const skipped = current.events.filter((event) =>
    event.type === 'step_skipped'
    && event.stepId === 'round_1_speech_0'
    && (event.payload as { reason?: string }).reason === 'undercover_debug_skip'
  );
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].visibility, 'system');
  assert.equal(undercoverWorkflow.steps[current.match.currentStepIndex]?.id, 'round_1_speech_1');
});

test('undercover debug skip rejects a round start breakpoint', () => {
  const match = createBreakpointMatch();

  assert.throws(
    () => controlBreakpoint(match.id, 'skip'),
    /only supports speech steps/,
  );
});

test('undercover debug skip rejects the final result breakpoint', () => {
  const match = createBreakpointMatch();
  const resultIndex = undercoverWorkflow.steps.length - 1;
  commitWorkflowChange({
    matchId: match.id,
    matchPatch: {
      current_step_index: resultIndex,
      status: 'running',
      blockers_json: '[]',
    },
    snapshot: true,
  });
  wakeTick(match.id);
  const interrupt = getDebugState(match.id)!.interrupts.find((item) =>
    item.stepId === 'result'
    && item.interruptType === 'undercover_debug_breakpoint'
    && item.status === 'pending'
  );
  assert.ok(interrupt);

  assert.throws(
    () => controlUndercoverDebugMatch({
      matchId: match.id,
      interruptId: interrupt.id,
      action: 'skip',
    }),
    /only supports speech steps/,
  );
});

test('undercover continuous debug control completes without further breakpoints', async () => {
  const match = createBreakpointMatch();

  controlBreakpoint(match.id, 'continuous');
  await runUndercoverWorkflow(match.id);

  const completed = getDebugState(match.id)!;
  assert.equal(completed.match.config.debugRunMode, 'continuous');
  assert.equal(completed.match.status, 'completed');
  assert.equal(completed.interrupts.filter((item) => item.status === 'pending').length, 0);
});

test('undercover debug runtime waits for admin control without auto-resolving the breakpoint', async () => {
  const match = createBreakpointMatch();
  let settled = false;
  const runtime = runUndercoverWorkflow(match.id).finally(() => { settled = true; });

  await new Promise<void>((resolve) => setTimeout(resolve, 120));
  assert.equal(settled, false);
  assert.equal(
    getDebugState(match.id)!.interrupts.filter((item) => item.status === 'pending').length,
    1,
  );

  controlBreakpoint(match.id, 'continuous');
  await runtime;
  assert.equal(getDebugState(match.id)!.match.status, 'completed');
});

test('undercover debug runtime aborts promptly without resolving its pending breakpoint', async () => {
  const match = createBreakpointMatch();
  const controller = new AbortController();
  let settled = false;
  const runtime = runUndercoverWorkflow(match.id, { signal: controller.signal })
    .then(
      () => ({ kind: 'resolved' as const, error: null }),
      (error: unknown) => ({ kind: 'rejected' as const, error }),
    )
    .finally(() => { settled = true; });

  controller.abort(new Error('undercover-session-disconnected'));
  const outcome = await Promise.race([
    runtime,
    new Promise<{ kind: 'timeout'; error: null }>((resolve) =>
      setTimeout(() => resolve({ kind: 'timeout', error: null }), 250)
    ),
  ]);

  try {
    assert.equal(outcome.kind, 'rejected');
    assert.match(String(outcome.error), /undercover-session-disconnected/);
    assert.equal(pendingBreakpointId(match.id).includes('round_1_start'), true);
  } finally {
    if (!settled) {
      try {
        controlBreakpoint(match.id, 'continuous');
      } catch {
        (controlUndercoverDebugMatch as unknown as (
          matchId: string,
          action: 'continuous',
        ) => unknown)(match.id, 'continuous');
      }
      await runtime;
    }
  }
});

test('normal undercover matches never create debug breakpoints', () => {
  const match = createUndercoverWorkflowMatch({
    players: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nickname: `${index + 1}号` })),
    debugMode: false,
  });

  const current = getDebugState(match.id)!;
  assert.equal(current.interrupts.some((item) => item.interruptType === 'undercover_debug_breakpoint'), false);
  assert.notEqual(current.match.status, 'paused_debug');
});

test('undercover debug control validates match, interrupt type, step and action', () => {
  assert.throws(
    () => controlUndercoverDebugMatch({
      matchId: 'missing-undercover-match',
      interruptId: 'missing-interrupt',
      action: 'continue',
    }),
    /Undercover debug match not found/,
  );

  const normal = createUndercoverWorkflowMatch({
    players: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nickname: `${index + 1}号` })),
    debugMode: false,
  });
  assert.throws(
    () => controlUndercoverDebugMatch({
      matchId: normal.id,
      interruptId: 'missing-interrupt',
      action: 'continue',
    }),
    /not a debug match/,
  );

  const workflowId = `test.non-undercover-debug.${Date.now()}`;
  registerWorkflow({
    id: workflowId,
    gameType: 'debate',
    steps: [{ id: 'done', type: 'test.done' }],
  }, {
    'test.done': {
      execute: ({ state }) => ({ status: 'COMPLETED', state, matchStatus: 'completed' }),
    },
  });
  const otherGame = createWorkflowMatch({
    workflowId,
    gameType: 'debate',
    config: { debugMode: true },
    initialState: {},
  });
  assert.throws(
    () => controlUndercoverDebugMatch({
      matchId: otherGame.id,
      interruptId: 'missing-interrupt',
      action: 'continue',
    }),
    /not an Undercover match/,
  );

  const foreignTarget = createBreakpointMatch();
  const foreignSource = createBreakpointMatch();
  assert.throws(
    () => controlUndercoverDebugMatch({
      matchId: foreignTarget.id,
      interruptId: pendingBreakpointId(foreignSource.id),
      action: 'continue',
    }),
    /does not belong to match/,
  );

  const wrongType = createBreakpointMatch();
  const wrongTypeState = getDebugState(wrongType.id)!;
  repository.createWorkflowInterrupt({
    id: `${wrongType.id}:manual-debug`,
    matchId: wrongType.id,
    stepId: undercoverWorkflow.steps[wrongTypeState.match.currentStepIndex].id,
    interruptType: 'manual_debug',
    status: 'pending',
    payload: {},
  });
  assert.throws(
    () => controlUndercoverDebugMatch({
      matchId: wrongType.id,
      interruptId: `${wrongType.id}:manual-debug`,
      action: 'continue',
    }),
    /not an Undercover debug breakpoint/,
  );

  const nonCurrent = createBreakpointMatch();
  const nonCurrentInterruptId = pendingBreakpointId(nonCurrent.id);
  commitWorkflowChange({
    matchId: nonCurrent.id,
    matchPatch: { current_step_index: 2 },
  });
  assert.throws(
    () => controlUndercoverDebugMatch({
      matchId: nonCurrent.id,
      interruptId: nonCurrentInterruptId,
      action: 'continue',
    }),
    /current step/,
  );

  const invalid = createBreakpointMatch();
  assert.throws(
    () => controlUndercoverDebugMatch({
      matchId: invalid.id,
      interruptId: '',
      action: 'continue',
    }),
    /interruptId is required/,
  );
  assert.throws(
    () => controlUndercoverDebugMatch({
      matchId: invalid.id,
      interruptId: pendingBreakpointId(invalid.id),
      action: 'invalid' as never,
    }),
    /Invalid Undercover debug action/,
  );
});

test('undercover debug control rejects a stale interrupt id for every action', () => {
  for (const action of ['continue', 'skip', 'continuous'] as const) {
    const match = createBreakpointMatch();
    const staleInterruptId = pendingBreakpointId(match.id);
    controlUndercoverDebugMatch({
      matchId: match.id,
      interruptId: staleInterruptId,
      action: 'continue',
    });
    const currentInterruptId = pendingBreakpointId(match.id);

    assert.throws(
      () => controlUndercoverDebugMatch({
        matchId: match.id,
        interruptId: staleInterruptId,
        action,
      }),
      /not pending/,
    );
    assert.equal(pendingBreakpointId(match.id), currentInterruptId);
  }
});

test('undercover debug breakpoint rejects unknown persisted statuses', () => {
  const match = createBreakpointMatch();
  const interruptId = pendingBreakpointId(match.id);
  repository.updateWorkflowInterrupt(interruptId, { status: 'unexpected_status' });
  const state = getDebugState(match.id)!;
  const step = undercoverWorkflow.steps[state.match.currentStepIndex];

  assert.throws(
    () => evaluateDebugBreakpoint(state.match, step),
    /Unknown Undercover debug breakpoint status/,
  );
});

test('undercover breakpoint flow never uses paused_debug', () => {
  const match = createBreakpointMatch();
  assert.equal(getDebugState(match.id)!.match.status, 'waiting');

  controlBreakpoint(match.id, 'continue');
  assert.equal(getDebugState(match.id)!.match.status, 'waiting');
  assert.equal(
    getDebugState(match.id)!.events.some((event) =>
      JSON.stringify(event.payload).includes('paused_debug')
    ),
    false,
  );
});

test('undercover debug-ready outbox event exposes the real public game id without secrets', () => {
  const match = createBreakpointMatch();
  const ready = getDebugState(match.id)!;
  const outbox = ready.outbox.find((message) =>
    (message.payload as { type?: string }).type === 'undercover-debug-ready'
  );
  assert.ok(outbox);

  const payload = (outbox.payload as { payload?: Record<string, unknown> }).payload || {};
  assert.equal((payload.game as { id?: string }).id, match.id);
  assert.equal((payload.payload as { matchId?: string }).matchId, match.id);
  assert.doesNotMatch(JSON.stringify(payload), /wordPair|playerWords|undercoverPlayerId|咖啡|奶茶/);
});

test('undercover workflow completes a civilian win and persists public events', () => {
  registerUndercoverWorkflow();
  const match = createDebugMatch();
  controlBreakpoint(match.id, 'continuous');

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
  controlBreakpoint(match.id, 'continuous');
  const task = claimNextAiTask({ matchId: match.id, workerId: 'undercover-leak-test' });
  assert.equal(task?.action, 'undercover_speech');
  completeAiTask(task!.id, { payload: { action: task!.action, speech: '我喜欢咖啡' } });

  const current = getDebugState(match.id);
  assert.equal(current.match.state.speeches[0].text, '这个事物在生活中并不少见');
  assert.doesNotMatch(JSON.stringify(current.events.filter((event) => event.visibility === 'public')), /咖啡|茶/);
});

test('persisted ballots are omitted from the public vote result', () => {
  const match = createDebugMatch();
  controlBreakpoint(match.id, 'continuous');
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

test('production match ignores every debug override and uses server-owned setup', () => {
  const players = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nickname: `${index + 1}号` }));
  const match = createUndercoverWorkflowMatch({
    players,
    debugMode: false,
    debug: {
      seed: -1,
      civilianWord: '未审核词甲',
      undercoverWord: '未审核词乙',
      undercoverPlayerId: 6,
    },
  });
  const state = getDebugState(match.id).match.state;
  assert.ok(Number.isInteger(state.seed) && state.seed >= 0 && state.seed <= 0xffffffff);
  assert.notEqual(state.seed, -1);
  assert.ok(UNDERCOVER_WORD_PAIRS.some((candidate) => candidate.civilian === state.wordPair.civilian && candidate.undercover === state.wordPair.undercover));
  assert.equal(state.undercoverPlayerId, players[seededIndex(state.seed, players.length, 1)].id);
});

test('debug match retains deterministic setup overrides', () => {
  const match = createDebugMatch();
  const state = getDebugState(match.id).match.state;
  assert.equal(state.seed, 7);
  assert.deepEqual(state.wordPair, { civilian: '咖啡', undercover: '茶' });
  assert.equal(state.undercoverPlayerId, 6);
});

test('only literal debugMode true enables setup overrides', () => {
  const players = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nickname: `${index + 1}号` }));
  const config = {
    players,
    debugMode: 'true',
    debug: { seed: -1, civilianWord: '未审核词甲', undercoverWord: '未审核词乙', undercoverPlayerId: 6 },
  } as unknown as UndercoverRuntimeConfig;
  const match = createUndercoverWorkflowMatch(config);
  const state = getDebugState(match.id).match.state;
  assert.ok(state.seed >= 0);
  assert.equal(state.undercoverPlayerId, players[seededIndex(state.seed, players.length, 1)].id);
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
  const match = createUndercoverWorkflowMatch({ players, debugMode: false });
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
  const match = createUndercoverWorkflowMatch({ players, debugMode: false });
  const undercoverId = Number(getDebugState(match.id).match.state.undercoverPlayerId);
  BasePlayerAgent.prototype.askJson = async function (_prompt, options) {
    return options.phase === 'speech'
      ? { speech: '常见描述' }
      : { targetId: Number(this.player.id) === undercoverId ? players[0].id : undercoverId, reason: '测试票' };
  };
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

for (const status of ['failed', 'paused_debug']) {
  test(`undercover runtime rejects a ${status} workflow match`, async () => {
    const match = createDebugMatch();
    commitWorkflowChange({
      matchId: match.id,
      matchPatch: {
        status,
        error_json: JSON.stringify({ message: `injected ${status}` }),
      },
    });

    await assert.rejects(
      runUndercoverWorkflow(match.id),
      new RegExp(`谁是卧底工作流异常停止（${status}）：injected ${status}`),
    );
  });
}

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
