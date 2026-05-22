function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
function toJson(value) { return JSON.stringify(value ?? null); }

function rowToGame(row) {
  if (!row) return null;
  return {
    id: row.id, gameType: row.game_type, mode: row.mode,
    skinId: row.skin_id, skinName: row.skin_name,
    winner: row.winner, winReason: row.win_reason,
    topic: parseJson(row.topic_json, {}),
    players: parseJson(row.players_json, []),
    rounds: parseJson(row.rounds_json, []),
    event: parseJson(row.event_json, {}),
    audioResources: parseJson(row.audio_resources_json, []),
    createdAt: row.created_at
  };
}

function rowToGameSummary(row) {
  if (!row) return null;
  return {
    id: row.id, gameType: row.game_type, mode: row.mode,
    skinName: row.skin_name, winner: row.winner,
    winReason: row.win_reason, playerCount: parseJson(row.players_json, []).length,
    createdAt: row.created_at
  };
}

function normalizeGameType(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('debate')) return 'debate';
  if (text.includes('werewolf')) return 'werewolf';
  return 'consensus';
}

function getGameTypeName(gameType) {
  if (gameType === 'debate') return 'AI 辩论赛';
  if (gameType === 'werewolf') return 'AI 狼人杀';
  return '共识迷雾';
}

module.exports = { parseJson, toJson, rowToGame, rowToGameSummary, normalizeGameType, getGameTypeName };
