import assert from 'node:assert/strict';
import test from 'node:test';
import { setDbExecutorForTests } from '../../packages/server/db';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import * as repo from '../../packages/server/modules/workflow-engine/repository';
import { tickMatch } from '../../packages/server/modules/workflow-engine/tick';
import { registerWorkflow } from '../../packages/server/modules/workflow-engine/workflowRegistry';
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

async function seedMatch(id: string): Promise<void> {
  const now = new Date().toISOString();
  await repo.createMatch({ id, game_type: 'test', workflow_id: workflowId, status: 'running',
    current_step_index: 0, version: 0, config_json: '{}', state_json: '{}', blockers_json: '[]',
    error_json: 'null', created_at: now, updated_at: now, completed_at: null });
}

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
