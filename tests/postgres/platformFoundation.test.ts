import assert from 'node:assert/strict';
import test from 'node:test';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import { getDbExecutorForTests, setDbExecutorForTests } from '../../packages/server/db';
import * as workflowRepository from '../../packages/server/modules/workflow-engine/repository';
import * as variantRepository from '../../packages/server/modules/game-variants/repository';
import { appendAudit } from '../../packages/server/modules/admin-audit/repository';
import { withTestSchema } from './helpers';

test('platform persistence records explicit schema versions', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    const previous = getDbExecutorForTests();
    setDbExecutorForTests(database);
    try {
      const now = new Date().toISOString();
      await workflowRepository.createMatch({
        id: 'versioned-match', game_type: 'werewolf', workflow_id: 'werewolf-v1', status: 'running',
        current_step_index: 0, version: 0, definition_version: '1.0.0', state_schema_version: 2,
        config_json: '{}', state_json: '{}', blockers_json: '[]', error_json: 'null',
        created_at: now, updated_at: now, completed_at: null,
      });
      await workflowRepository.appendEvent({ matchId: 'versioned-match', type: 'created',
        eventSchemaVersion: 3, actorType: 'system', correlationId: 'request-1' });
      const match = await workflowRepository.getMatch('versioned-match');
      const events = await workflowRepository.listEvents('versioned-match');
      assert.equal(match?.definitionVersion, '1.0.0');
      assert.equal(match?.stateSchemaVersion, 2);
      assert.equal(events[0]?.eventSchemaVersion, 3);
      assert.equal(events[0]?.actorType, 'system');
      assert.equal(events[0]?.correlationId, 'request-1');
    } finally {
      setDbExecutorForTests(previous);
    }
  });
});

test('expired AI and outbox claims are recoverable', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    const previous = getDbExecutorForTests();
    setDbExecutorForTests(database);
    try {
      const now = new Date().toISOString();
      await workflowRepository.createMatch({
        id: 'recovery-match', game_type: 'debate', workflow_id: 'debate-v1', status: 'running',
        current_step_index: 0, version: 0, definition_version: '1.0.0', state_schema_version: 1,
        config_json: '{}', state_json: '{}', blockers_json: '[]', error_json: 'null',
        created_at: now, updated_at: now, completed_at: null,
      });
      await workflowRepository.createAiTask({ id: 'task-1', matchId: 'recovery-match', stepId: 's1',
        taskKey: 'k1', action: 'speak', maxAttempts: 3 });
      assert.equal((await workflowRepository.claimNextAiTask({ workerId: 'worker-a' }))?.workerId, 'worker-a');
      await database.execute(`UPDATE ai_tasks SET claim_expires_at = now() - interval '1 second' WHERE id = 'task-1'`);
      const reclaimed = await workflowRepository.claimNextAiTask({ workerId: 'worker-b' });
      assert.equal(reclaimed?.workerId, 'worker-b');
      assert.equal(reclaimed?.attempts, 2);

      const event = await workflowRepository.appendEvent({ matchId: 'recovery-match', type: 'public-event' });
      await workflowRepository.insertOutbox('recovery-match', event);
      assert.ok(await workflowRepository.claimPendingOutbox('recovery-match'));
      await database.execute(`UPDATE outbox_messages SET claim_expires_at = now() - interval '1 second'`);
      assert.ok(await workflowRepository.claimPendingOutbox('recovery-match'));
    } finally {
      setDbExecutorForTests(previous);
    }
  });
});

test('game variant revision and its audit record commit together', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    await database.withTransaction(async (transaction) => {
      const created = await variantRepository.createVariant({ gameType: 'werewolf', variantKey: 'standard',
        definitionVersion: '1.0.0', name: '标准局', config: { players: 9 } }, transaction);
      const updated = await variantRepository.updateVariant(created.id, { revision: created.revision,
        name: '标准九人局' }, transaction);
      assert.equal(updated?.revision, 2);
      await appendAudit({ actorAdminId: null, requestId: 'request-variant-1' }, {
        action: 'game_variant.updated', entityType: 'game_variant', entityId: String(created.id),
        before: created, after: updated,
      }, transaction);
    });
    assert.equal((await database.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM admin_audit_log WHERE request_id = 'request-variant-1'`,
    ))?.count, 1);
    await assert.rejects(
      database.execute(`UPDATE admin_audit_log SET action = 'tampered' WHERE request_id = 'request-variant-1'`),
      /append-only/,
    );
  });
});
