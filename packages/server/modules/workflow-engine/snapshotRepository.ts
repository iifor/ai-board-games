import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import type { MatchSnapshotRow } from '../../types/database';
import type { Match, MatchSnapshot } from '../../types/workflow';
import { nowIso, rowToSnapshot, toJson } from './utils';
import type { PersistenceTiming } from './persistenceTiming';

async function upsertSnapshot(match: Match, _timing?: PersistenceTiming, db: DbExecutor = getDbExecutor()): Promise<void> {
  const lastEventSeq = await getMaxEventSeq(match.id, db);
  await db.execute(`INSERT INTO match_snapshots
    (match_id, version, state_schema_version, status, current_step_index, last_event_seq, state_json, blockers_json, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [match.id, match.version, match.stateSchemaVersion,
    match.status, match.currentStepIndex, lastEventSeq, toJson(match.state), toJson(match.blockers || []), nowIso()]);
  await pruneSnapshots(match.id, 3, db);
}
async function listSnapshots(matchId: string, limit = 20): Promise<MatchSnapshot[]> {
  return (await getDbExecutor().queryMany<MatchSnapshotRow>(`SELECT * FROM match_snapshots
    WHERE match_id=$1 ORDER BY version DESC,id DESC LIMIT $2`, [matchId, limit || 20]))
    .map(rowToSnapshot).filter((snapshot): snapshot is MatchSnapshot => snapshot !== null);
}
async function getLatestSnapshot(matchId: string, db: DbExecutor = getDbExecutor()): Promise<MatchSnapshot | null> {
  return rowToSnapshot((await db.queryOne<MatchSnapshotRow>(`SELECT * FROM match_snapshots
    WHERE match_id=$1 ORDER BY version DESC,id DESC LIMIT 1`, [matchId])) || undefined);
}
async function getMaxEventSeq(matchId: string, db: DbExecutor = getDbExecutor()): Promise<number> {
  return (await db.queryOne<{ seq: number }>('SELECT COALESCE(MAX(seq),0) AS seq FROM workflow_events WHERE match_id=$1',[matchId]))?.seq || 0;
}
async function countEventsAfter(matchId: string, afterSeq: number, db: DbExecutor = getDbExecutor()): Promise<number> {
  return (await db.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM workflow_events WHERE match_id=$1 AND seq>$2',[matchId,afterSeq]))?.count || 0;
}
async function shouldCreateSnapshot(matchId: string, status: string, db: DbExecutor = getDbExecutor()): Promise<boolean> {
  const latest = await getLatestSnapshot(matchId, db); if (!latest) return true;
  const eventCount = await countEventsAfter(matchId, latest.lastEventSeq || 0, db);
  if (['completed','failed','paused_debug','waiting'].includes(status)) return latest.status !== status || eventCount > 0;
  return eventCount >= 10;
}
async function pruneSnapshots(matchId: string, keep = 3, db: DbExecutor = getDbExecutor()): Promise<number> {
  const result = await db.execute(`DELETE FROM match_snapshots WHERE id IN (
    SELECT id FROM match_snapshots WHERE match_id=$1 ORDER BY version DESC,id DESC OFFSET $2)`, [matchId, Math.max(1,keep)]);
  return result.rowCount;
}
export { upsertSnapshot,listSnapshots,getLatestSnapshot,getMaxEventSeq,countEventsAfter,shouldCreateSnapshot,pruneSnapshots };
