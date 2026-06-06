import { getDb } from '../../db';
import { parseJson } from './utils';

interface TerminalDebugMatch {
  id: string;
}

function listTerminalDebugMatches(): TerminalDebugMatch[] {
  const rows = getDb().prepare(`
    SELECT id, config_json, created_at FROM matches
    WHERE status IN ('completed', 'failed', 'paused_debug')
    ORDER BY created_at DESC, id DESC
  `).all() as Array<{ id: string; config_json: string; created_at: string }>;
  return rows
    .filter((row) => Boolean(parseJson<Record<string, unknown>>(row.config_json, {}).debugMode))
    .map((row) => ({ id: row.id }));
}

function deleteMatchCascade(matchId: string): boolean {
  return getDb().prepare('DELETE FROM matches WHERE id = ?').run(matchId).changes > 0;
}

function getMatchLogicalBytes(matchId: string): number {
  const db = getDb() as unknown as {
    isJsonFallback?: boolean;
    data?: Record<string, Array<Record<string, unknown>>>;
  };
  if (db.isJsonFallback && db.data) {
    const related = Object.entries(db.data).flatMap(([table, rows]) =>
      rows.filter((row) =>
        (table === 'matches' && row.id === matchId)
        || row.match_id === matchId
      )
    );
    return Buffer.byteLength(JSON.stringify(related));
  }
  const sources = [
    ['matches', "config_json || state_json || blockers_json || error_json", 'id'],
    ['match_snapshots', "state_json || blockers_json", 'match_id'],
    ['workflow_events', "payload_json || visible_to_player_ids_json", 'match_id'],
    ['ai_tasks', "prompt_json || context_json || raw_output || result_json || error_json", 'match_id'],
    ['pending_actions', 'payload_json', 'match_id'],
    ['outbox_messages', 'payload_json', 'match_id'],
    ['action_window_epochs', 'window_json', 'match_id'],
    ['workflow_effects', 'payload_json', 'match_id'],
    ['workflow_interrupts', "payload_json || resolution_json", 'match_id'],
  ] as const;
  return sources.reduce((total, [table, expression, key]) => {
    const row = getDb().prepare(
      `SELECT COALESCE(SUM(LENGTH(${expression})), 0) AS bytes FROM ${table} WHERE ${key} = ?`,
    ).get(matchId) as { bytes?: number } | undefined;
    return total + Number(row?.bytes || 0);
  }, 0);
}

export { listTerminalDebugMatches, deleteMatchCascade, getMatchLogicalBytes };
export type { TerminalDebugMatch };
