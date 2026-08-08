import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';

interface RetentionMatch { id: string }

async function listTerminalDebugMatches(db: DbExecutor = getDbExecutor()): Promise<RetentionMatch[]> {
  return db.queryMany<RetentionMatch>(`
    SELECT id FROM matches
    WHERE status IN ('completed', 'failed', 'paused_debug')
      AND COALESCE((config_json::jsonb ->> 'debugMode')::boolean, false)
    ORDER BY created_at DESC, id DESC
  `);
}

async function listStaleActiveMatches(cutoffIso: string, db: DbExecutor = getDbExecutor()): Promise<RetentionMatch[]> {
  return db.queryMany<RetentionMatch>(`
    SELECT id FROM matches
    WHERE status IN ('running', 'waiting') AND updated_at < $1
    ORDER BY updated_at ASC, id ASC
  `, [cutoffIso]);
}

async function deleteMatchCascade(matchId: string, db: DbExecutor = getDbExecutor()): Promise<boolean> {
  return (await db.execute('DELETE FROM matches WHERE id = $1', [matchId])).rowCount > 0;
}

async function getMatchLogicalBytes(matchId: string, db: DbExecutor = getDbExecutor()): Promise<number> {
  const tables = ['matches', 'match_snapshots', 'workflow_events', 'ai_tasks', 'pending_actions',
    'outbox_messages', 'action_window_epochs', 'workflow_effects', 'workflow_interrupts'];
  let total = 0;
  for (const table of tables) {
    const key = table === 'matches' ? 'id' : 'match_id';
    const row = await db.queryOne<{ bytes: number }>(
      `SELECT COALESCE(SUM(pg_column_size(t)), 0)::bigint AS bytes FROM ${table} t WHERE ${key} = $1`,
      [matchId],
    );
    total += Number(row?.bytes || 0);
  }
  return total;
}

export { listTerminalDebugMatches, listStaleActiveMatches, deleteMatchCascade, getMatchLogicalBytes };
export type { RetentionMatch };
