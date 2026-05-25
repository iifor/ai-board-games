import type { Game, GameSummary } from '../../types/api';
import type { GameRow } from '../../types/database';

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function rowToGame(row: GameRow | null | undefined): Game | null {
  if (!row) return null;
  return {
    id: row.id,
    gameType: row.game_type,
    mode: row.mode,
    skinId: row.skin_id,
    skinName: row.skin_name,
    winner: row.winner,
    winReason: row.win_reason,
    topic: parseJson<Record<string, unknown>>(row.topic_json, {}),
    players: parseJson<unknown[]>(row.players_json, []),
    rounds: parseJson<unknown[]>(row.rounds_json, []),
    event: parseJson<Record<string, unknown>>(row.event_json, {}),
    audioResources: parseJson<unknown[]>(row.audio_resources_json, []),
    createdAt: row.created_at
  };
}

function rowToGameSummary(row: GameRow | null | undefined): GameSummary | null {
  if (!row) return null;
  return {
    id: row.id,
    gameType: row.game_type,
    mode: row.mode,
    skinName: row.skin_name,
    winner: row.winner,
    winReason: row.win_reason,
    playerCount: parseJson<unknown[]>(row.players_json, []).length,
    createdAt: row.created_at
  };
}

function normalizeGameType(value: unknown): string {
  const text = String(value || '').toLowerCase();
  if (text.includes('debate')) return 'debate';
  if (text.includes('werewolf')) return 'werewolf';
  return 'werewolf';
}

function getGameTypeName(gameType: string): string {
  if (gameType === 'debate') return 'AI 辩论赛';
  if (gameType === 'werewolf') return 'AI 狼人杀';
  return 'AI 狼人杀';
}

export { parseJson, toJson, rowToGame, rowToGameSummary, normalizeGameType, getGameTypeName };
