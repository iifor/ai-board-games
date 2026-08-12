import assert from 'node:assert/strict';
import test from 'node:test';
import { setDbExecutorForTests } from '../../packages/server/db';
import type { DbExecutor } from '../../packages/server/db/types';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import { recordWorkflowEffects } from '../../packages/server/modules/workflow-engine/effects';
import * as repo from '../../packages/server/modules/workflow-engine/repository';
import { tickMatch } from '../../packages/server/modules/workflow-engine/tick';
import { getStepHandler, registerWorkflow } from '../../packages/server/modules/workflow-engine/workflowRegistry';
import { buildActionWindow } from '../../packages/server/modules/werewolf/actionWindows';
import { DEBATE_WORKFLOW_ID, debateWorkflow, registerDebateWorkflow } from '../../packages/server/modules/debate/workflow';
import { withTestSchema } from './helpers';

const workflowId = 'postgres.concurrent-test.v1';
registerWorkflow({ id: workflowId, gameType: 'test', steps: [{ id: 'only', type: 'test.complete' }] }, {
  'test.complete': {
    async execute({ state }) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        status: 'COMPLETED',
        matchStatus: 'completed',
        state: { ...state, executions: Number(state.executions || 0) + 1 },
        events: [{ type: 'test_completed', payload: {}, idempotencyKey: 'only:completed' }],
      };
    },
  },
});

const actionWindowWorkflowId = 'postgres.action-window-transaction-test.v1';
registerWorkflow({ id: actionWindowWorkflowId, gameType: 'werewolf', steps: [{
  id: 'wolf_kill_1',
  type: 'test.action-window',
  config: { day: 1, phase: 'night', actionType: 'wolf_kill' },
}] }, {
  'test.action-window': {
    async execute({ match, step, state, db }) {
      const window = await buildActionWindow({
        match,
        step,
        state,
        actionType: 'wolf_kill',
        actors: [{ id: 1 }],
        targetIds: [2],
        db,
      } as never);
      return { status: 'WAITING', state: { ...state, currentActionWindow: window }, blockers: [] };
    },
  },
});

const failingAiAdvanceWorkflowId = 'postgres.ai-advance-failure-test.v1';
registerWorkflow({ id: failingAiAdvanceWorkflowId, gameType: 'test', steps: [{ id: 'explode', type: 'test.explode' }] }, {
  'test.explode': {
    async execute() {
      throw new Error('forced workflow advance failure');
    },
  },
});

async function seedMatch(id: string, registeredWorkflowId: string = workflowId): Promise<void> {
  const now = new Date().toISOString();
  await repo.createMatch({ id, game_type: 'test', workflow_id: registeredWorkflowId, status: 'running',
    current_step_index: 0, version: 0, config_json: '{}', state_json: '{}', blockers_json: '[]',
    error_json: 'null', created_at: now, updated_at: now, completed_at: null });
}

test('action-window epoch writes reuse the transaction that owns the match row lock', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      await seedMatch('match-action-window', actionWindowWorkflowId);
      const match = await tickMatch('match-action-window');
      const epochs = await repo.listActionWindowEpochs('match-action-window');
      assert.equal(match.status, 'waiting');
      assert.equal(epochs.length, 1);
      assert.equal(epochs[0]?.actionType, 'wolf_kill');
    } finally { setDbExecutorForTests(null); }
  });
});

test('workflow effect writes reuse the transaction that owns the match row lock', async () => {
  const now = new Date().toISOString();
  const transaction = {
    async execute() { return { rowCount: 1 }; },
    async queryOne() {
      return {
        id: 'effect-transaction', match_id: 'match-effect', step_id: 'resolve', source_event_seq: null,
        effect_type: 'eliminate', status: 'applied', priority: 1, payload_json: '{}',
        applied_event_seq: null, created_at: now, updated_at: now,
      };
    },
  } as unknown as DbExecutor;
  const globalExecutor = {
    async execute() { throw new Error('global executor used while match row is locked'); },
  } as unknown as DbExecutor;
  setDbExecutorForTests(globalExecutor);
  try {
    const effects = await recordWorkflowEffects({
      matchId: 'match-effect', stepId: 'resolve', effects: [{ id: 'effect-transaction', type: 'eliminate' }],
      db: transaction,
    } as never);
    assert.equal(effects[0]?.id, 'effect-transaction');
  } finally { setDbExecutorForTests(null); }
});

test('completing an AI task persists its result and advances the match in one transaction', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      await seedMatch('match-ai-completion');
      await repo.createAiTask({ id: 'task-completion', matchId: 'match-ai-completion', stepId: 'only',
        taskKey: 'completion', action: 'test', status: 'running' });
      const { completeAiTask } = await import('../../packages/server/modules/workflow-engine/service');
      const match = await completeAiTask('task-completion', { payload: { accepted: true } });
      assert.equal(match.status, 'completed');
      assert.equal((await repo.getAiTask('task-completion'))?.status, 'succeeded');
      assert.equal((await repo.listEvents('match-ai-completion')).some((event) => event.type === 'ai_task_succeeded'), true);
    } finally { setDbExecutorForTests(null); }
  });
});

test('debate AI turns read the succeeded task from the transaction that completes it', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      registerDebateWorkflow();
      const matchId = 'match-debate-ai-completion';
      await seedMatch(matchId, DEBATE_WORKFLOW_ID);
      await repo.createAiTask({
        id: 'task-debate-completion', matchId, stepId: 'opening_pro_1', taskKey: 'opening_pro_1',
        playerId: 3, action: 'opening_argue', status: 'running',
      });
      const step = debateWorkflow.steps.find((item) => item.id === 'opening_pro_1');
      assert.ok(step);

      const result = await database.withTransaction(async (transaction) => {
        await repo.updateAiTask('task-debate-completion', {
          status: 'succeeded',
          result_json: JSON.stringify({ payload: {
            action: 'opening_argue', actorId: 3, text: '事务内可见的正方立论', thinking: '',
          } }),
        }, transaction);
        return getStepHandler(DEBATE_WORKFLOW_ID, 'debate.ai_turn').execute({
          match: { id: matchId, state: {}, config: {} },
          workflow: debateWorkflow,
          step,
          state: {
            topic: { title: '测试辩题', proPosition: '正方', conPosition: '反方' },
            players: [{ id: 3, name: '正方一辩', side: 'pro', sideLabel: '正方' }],
            phases: [], completedSteps: {},
          },
          db: transaction,
        } as never);
      });

      assert.equal(result.status, 'COMPLETED');
      assert.equal(result.state.completedSteps?.opening_pro_1, true);
    } finally { setDbExecutorForTests(null); }
  });
});

test('AI result recovery persists the succeeded task before pausing a failed workflow advance', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      const matchId = 'match-ai-advance-failure';
      await seedMatch(matchId, failingAiAdvanceWorkflowId);
      await repo.createAiTask({
        id: 'task-ai-advance-failure', matchId, stepId: 'explode', taskKey: 'explode',
        playerId: 9, action: 'test', status: 'running',
      });
      const { completeAiTask } = await import('../../packages/server/modules/workflow-engine/service');

      const match = await completeAiTask('task-ai-advance-failure', {
        eventType: 'ai_task_succeeded', rawOutput: 'kept output', payload: { accepted: true },
      });
      const task = await repo.getAiTask('task-ai-advance-failure');
      const eventTypes = (await repo.listEvents(matchId)).map((event) => event.type);

      assert.equal(match.status, 'paused_debug');
      assert.equal(task?.status, 'succeeded');
      assert.equal(task?.rawOutput, 'kept output');
      assert.deepEqual(eventTypes, ['ai_task_succeeded', 'workflow_advance_failed']);
    } finally { setDbExecutorForTests(null); }
  });
});

test('concurrent ticks advance a locked match once with contiguous event sequence', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      await seedMatch('match-concurrent');
      await Promise.all([tickMatch('match-concurrent'), tickMatch('match-concurrent')]);
      const match = await repo.getMatch('match-concurrent');
      const events = await repo.listEvents('match-concurrent');
      assert.equal(match?.status, 'completed');
      assert.equal(match?.state.executions, 1);
      assert.deepEqual(events.map((event) => event.seq), events.map((_, index) => index + 1));
      assert.equal(new Set(events.map((event) => event.seq)).size, events.length);
    } finally { setDbExecutorForTests(null); }
  });
});

test('workflow transaction rolls back match, event and outbox together', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      await seedMatch('match-rollback');
      await assert.rejects(database.withTransaction(async (transaction) => {
        await repo.commitWorkflowChange({ matchId: 'match-rollback', events: [{ type: 'rolled_back', idempotencyKey: 'rollback' }],
          matchPatch: { status: 'completed' } }, transaction);
        throw new Error('force rollback');
      }), /force rollback/);
      assert.equal((await repo.getMatch('match-rollback'))?.status, 'running');
      assert.equal((await repo.listEvents('match-rollback')).length, 0);
      assert.equal((await repo.listOutboxMessages('match-rollback')).length, 0);
    } finally { setDbExecutorForTests(null); }
  });
});

test('idempotent events and concurrent worker claims cannot duplicate work', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      await seedMatch('match-claims');
      await Promise.all([
        repo.commitWorkflowChange({ matchId: 'match-claims', events: [{ type: 'once', idempotencyKey: 'same-key' }] }),
        repo.commitWorkflowChange({ matchId: 'match-claims', events: [{ type: 'once', idempotencyKey: 'same-key' }] }),
      ]);
      assert.equal((await repo.listEvents('match-claims')).length, 1);

      for (const suffix of ['a', 'b']) await repo.createAiTask({ id: `task-${suffix}`, matchId: 'match-claims',
        stepId: 'only', taskKey: suffix, action: 'test' });
      const taskClaims = await Promise.all([
        repo.claimNextAiTask({ matchId: 'match-claims', workerId: 'one' }),
        repo.claimNextAiTask({ matchId: 'match-claims', workerId: 'two' }),
      ]);
      assert.equal(new Set(taskClaims.map((task) => task?.id)).size, 2);

      const outboxClaims = await Promise.all([
        repo.claimPendingOutbox('match-claims'), repo.claimPendingOutbox('match-claims'),
      ]);
      assert.equal(outboxClaims.filter(Boolean).length, 1);
    } finally { setDbExecutorForTests(null); }
  });
});
