import { getDb } from '../../db';
import type { MatchSnapshotRow } from '../../types/database';
import type { Match, MatchSnapshot } from '../../types/workflow';
import { nowIso, rowToSnapshot, toJson } from './utils';
import { addBytes, measureStage } from './persistenceTiming';
import type { PersistenceTiming } from './persistenceTiming';

function upsertSnapshot(match: Match, timing?: PersistenceTiming): void {
  const lastEventSeq = getMaxEventSeq(match.id);
  const stateJson = timing
    ? measureStage(timing, 'snapshotStateSerializeMs', () => toJson(match.state))
    : toJson(match.state);
  const blockersJson = timing
    ? measureStage(timing, 'snapshotBlockersSerializeMs', () => toJson(match.blockers || []))
    : toJson(match.blockers || []);
  if (timing) {
    addBytes(timing, 'snapshotStateBytes', stateJson);
    addBytes(timing, 'snapshotBlockersBytes', blockersJson);
  }
  const write = () => getDb().prepare(`
    INSERT INTO match_snapshots (
      match_id, version, status, current_step_index, last_event_seq,
      state_json, blockers_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    match.id,
    match.version,
    match.status,
    match.currentStepIndex,
    lastEventSeq,
    stateJson,
    blockersJson,
    nowIso(),
  );
  if (timing) measureStage(timing, 'snapshotWriteMs', write);
  else write();
  pruneSnapshots(match.id);
}

function listSnapshots(matchId: string, limit: number = 20): MatchSnapshot[] {
  return (getDb().prepare(
    'SELECT * FROM match_snapshots WHERE match_id = ? ORDER BY version DESC, id DESC LIMIT ?',
  ).all(matchId, Number(limit) || 20) as MatchSnapshotRow[])
    .map(rowToSnapshot)
    .filter((snapshot): snapshot is MatchSnapshot => snapshot !== null);
}

function getLatestSnapshot(matchId: string): MatchSnapshot | null {
  return rowToSnapshot(getDb().prepare(
    'SELECT * FROM match_snapshots WHERE match_id = ? ORDER BY version DESC, id DESC LIMIT 1',
  ).get(matchId) as MatchSnapshotRow | undefined);
}

function getMaxEventSeq(matchId: string): number {
  const row = getDb().prepare(
    'SELECT COALESCE(MAX(seq), 0) AS seq FROM workflow_events WHERE match_id = ?',
  ).get(matchId) as { seq?: number } | undefined;
  return Number(row?.seq || 0);
}

function countEventsAfter(matchId: string, afterSeq: number): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) AS count FROM workflow_events WHERE match_id = ? AND seq > ?',
  ).get(matchId, afterSeq) as { count?: number } | undefined;
  return Number(row?.count || 0);
}

function shouldCreateSnapshot(matchId: string, status: string): boolean {
  const latest = getLatestSnapshot(matchId);
  if (!latest) return true;
  const eventCount = countEventsAfter(matchId, latest.lastEventSeq || 0);
  if (['completed', 'failed', 'paused_debug'].includes(status)) {
    return latest.status !== status || eventCount > 0;
  }
  if (status === 'waiting') {
    return latest.status !== status || eventCount > 0;
  }
  return eventCount >= 10;
}

function pruneSnapshots(matchId: string, keep: number = 3): number {
  const rows = getDb().prepare(
    'SELECT id FROM match_snapshots WHERE match_id = ? ORDER BY version DESC, id DESC',
  ).all(matchId) as Array<{ id: number }>;
  const staleIds = rows.slice(Math.max(1, keep)).map((row) => row.id);
  if (!staleIds.length) return 0;
  const placeholders = staleIds.map(() => '?').join(', ');
  return getDb().prepare(`DELETE FROM match_snapshots WHERE id IN (${placeholders})`)
    .run(...staleIds).changes;
}

export {
  upsertSnapshot,
  listSnapshots,
  getLatestSnapshot,
  getMaxEventSeq,
  countEventsAfter,
  shouldCreateSnapshot,
  pruneSnapshots,
};
