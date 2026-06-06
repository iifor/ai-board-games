import { getDb } from '../../db';
import { parseJson, toJson } from '../games/utils';
import type { GamePlaybackEventRow } from '../../types/database';
import type { PlaybackEvent } from '@ai-presenter/shared/types/playbackTypes';

function replacePlaybackEvents(gameId: string, events: PlaybackEvent[]): void {
  const db = getDb();
  db.prepare('DELETE FROM game_playback_events WHERE game_id = ?').run(gameId);
  const insert = db.prepare(`
    INSERT INTO game_playback_events (
      game_id, sequence, protocol_version, event_type, view_mode, payload_json, media_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const event of events) {
    insert.run(
      gameId,
      event.sequence,
      event.protocolVersion,
      event.eventType,
      event.viewMode,
      toJson(event.payload),
      toJson(event.media),
    );
  }
}

function listPlaybackEvents(gameId: string): PlaybackEvent[] {
  const rows = getDb().prepare(`
    SELECT * FROM game_playback_events
    WHERE game_id = ?
    ORDER BY sequence ASC
  `).all(gameId) as GamePlaybackEventRow[];
  return rows.map((row) => ({
    protocolVersion: row.protocol_version,
    sequence: row.sequence,
    eventType: row.event_type,
    viewMode: row.view_mode,
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    media: parseJson(row.media_json, []),
  }));
}

function deletePlaybackEvents(gameId: string): void {
  getDb().prepare('DELETE FROM game_playback_events WHERE game_id = ?').run(gameId);
}

export { replacePlaybackEvents, listPlaybackEvents, deletePlaybackEvents };
