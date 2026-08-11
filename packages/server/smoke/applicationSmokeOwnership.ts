import crypto from 'node:crypto';
import type { DbExecutor } from '../db/types';

interface SmokePlayer { id: number; nickname: string }

interface ApplicationSmokeOwnership {
  gameId: string;
  marker: string;
  playerIds: number[];
  players: SmokePlayer[];
  skinId: string | null;
  skinName: string;
}

function createApplicationSmokeOwnership(runId: string): ApplicationSmokeOwnership {
  const digest = crypto.createHash('sha256').update(runId).digest('hex');
  const marker = `application-smoke-${digest.slice(0, 16)}`;
  const baseId = -(Number.parseInt(digest.slice(0, 12), 16) + 1_000_000);
  const playerIds = Array.from({ length: 6 }, (_, index) => baseId - index);
  return {
    gameId: marker,
    marker,
    playerIds,
    players: playerIds.map((id, index) => ({ id, nickname: `${marker}-player-${index + 1}` })),
    skinId: null,
    skinName: `Application Smoke ${runId}`.slice(0, 180),
  };
}

async function createRunOwnedSmokePlayers(
  database: DbExecutor,
  ownership: ApplicationSmokeOwnership,
): Promise<void> {
  await database.withTransaction(async (transaction) => {
    const existing = await transaction.queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM players WHERE id = ANY($1::bigint[])',
      [ownership.playerIds],
    );
    if (Number(existing?.count || 0) !== 0) throw new Error('Application smoke ownership collision');
    for (const [index, player] of ownership.players.entries()) {
      await transaction.execute(`INSERT INTO players (
        id, nickname, name, personality, provider, model, enabled, sort_order
      ) VALUES ($1, $2, $2, $3, $3, $3, 1, $4)`, [
        player.id, player.nickname, ownership.marker, index + 1,
      ]);
    }
  });
}

async function cleanupRunOwnedSmokeRows(
  database: DbExecutor,
  ownership: ApplicationSmokeOwnership,
  adminUsername: string,
): Promise<void> {
  let traceIds: string[] = [];
  await database.withTransaction(async (transaction) => {
    const gameId = ownership.gameId;
    traceIds = (await transaction.queryMany<{ traceId: string }>(`
      SELECT DISTINCT trace_id AS "traceId" FROM trace_spans
      WHERE parent_span_id IS NULL AND attributes_json ->> 'game.id' = $1
    `, [gameId])).map((row) => row.traceId);
    await transaction.execute('DELETE FROM game_events WHERE trace_id = ANY($1::text[])', [traceIds]);
    await transaction.execute('DELETE FROM trace_spans WHERE trace_id = ANY($1::text[])', [traceIds]);
    await transaction.execute('DELETE FROM game_traces WHERE id = ANY($1::text[])', [traceIds]);
    await transaction.execute('DELETE FROM workflow_events WHERE match_id = $1', [gameId]);
    await transaction.execute('DELETE FROM matches WHERE id = $1', [gameId]);
    await transaction.execute('DELETE FROM game_playback_events WHERE game_id = $1', [gameId]);
    await transaction.execute('DELETE FROM game_players WHERE game_id = $1', [gameId]);
    await transaction.execute('DELETE FROM games WHERE id = $1', [gameId]);
    await transaction.execute(`DELETE FROM player_game_memories
      WHERE owner_player_id = ANY($1::bigint[]) OR subject_player_id = ANY($1::bigint[])`,
    [ownership.playerIds]);
    await transaction.execute(`DELETE FROM players
      WHERE id = ANY($1::bigint[]) AND provider = $2 AND personality = $2`,
    [ownership.playerIds, ownership.marker]);
    if (ownership.skinId) {
      await transaction.execute('DELETE FROM skins WHERE id = $1', [ownership.skinId]);
    }
    await transaction.execute('DELETE FROM skins WHERE name = $1', [ownership.skinName]);
    await transaction.execute('DELETE FROM admin_users WHERE username = $1', [adminUsername]);
  });

  const remaining = await database.queryOne<{ count: number }>(`
    SELECT
      (SELECT COUNT(*) FROM players WHERE id = ANY($1::bigint[]))
      + (SELECT COUNT(*) FROM player_game_memories
          WHERE owner_player_id = ANY($1::bigint[]) OR subject_player_id = ANY($1::bigint[]))
      + (SELECT COUNT(*) FROM games WHERE id = $2)
      + (SELECT COUNT(*) FROM matches WHERE id = $2)
      + (SELECT COUNT(*) FROM game_traces WHERE id = ANY($4::text[]))
      + (SELECT COUNT(*) FROM admin_users WHERE username = $3)
      + (SELECT COUNT(*) FROM skins WHERE id = $5 OR name = $6) AS count
  `, [ownership.playerIds, ownership.gameId, adminUsername, traceIds, ownership.skinId, ownership.skinName]);
  if (Number(remaining?.count || 0) !== 0) throw new Error('Application smoke fixture cleanup incomplete');
}

export { cleanupRunOwnedSmokeRows, createApplicationSmokeOwnership, createRunOwnedSmokePlayers };
export type { ApplicationSmokeOwnership, SmokePlayer };
