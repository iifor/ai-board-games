import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import { parseJson, toJson } from '../games/utils';
import type { GamePlaybackEventRow } from '../../types/database';
import type { PlaybackEvent } from '@ai-presenter/shared/types/playbackTypes';

async function replacePlaybackEvents(gameId: string, events: PlaybackEvent[], db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute('DELETE FROM game_playback_events WHERE game_id = $1', [gameId]);
  for (const event of events) {
    await db.execute(`INSERT INTO game_playback_events
      (game_id, sequence, protocol_version, event_type, view_mode, payload_json, media_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`, [gameId, event.sequence, event.protocolVersion,
      event.eventType, event.viewMode, toJson(event.payload), toJson(event.media)]);
  }
}

async function listPlaybackEvents(gameId: string): Promise<PlaybackEvent[]> {
  const rows = await getDbExecutor().queryMany<GamePlaybackEventRow>(`
    SELECT * FROM game_playback_events WHERE game_id = $1 ORDER BY sequence ASC`, [gameId]);
  return rows.map((row) => ({
    protocolVersion: row.protocol_version,
    sequence: row.sequence,
    eventType: row.event_type,
    viewMode: row.view_mode,
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    media: parseJson(row.media_json, []),
  }));
}

async function deletePlaybackEvents(gameId: string, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute('DELETE FROM game_playback_events WHERE game_id = $1', [gameId]);
}

export { replacePlaybackEvents, listPlaybackEvents, deletePlaybackEvents };
