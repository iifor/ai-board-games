const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');
const MAX_LOGS = 20;
const GAME_TYPES = ['consensus', 'debate', 'werewolf'];

function ensureLogDir(gameType = '') {
  const dir = getLogDir(gameType);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLogDir(gameType = '') {
  return gameType ? path.join(LOG_DIR, normalizeGameType(gameType)) : LOG_DIR;
}

function getLogFiles(gameType = '') {
  const dir = ensureLogDir(gameType);
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const fullPath = path.join(dir, name);
      return {
        name,
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function saveGameLog(game) {
  const gameType = normalizeGameType(game?.type || game?.gameType || game?.id);
  const dir = ensureLogDir(gameType);
  const safeId = String(game.id || Date.now()).replace(/[^\w.-]+/g, '-');
  const filename = `${Date.now()}-${safeId}.json`;
  const fullPath = path.join(dir, filename);
  const record = {
    savedAt: new Date().toISOString(),
    gameType,
    game
  };

  fs.writeFileSync(fullPath, JSON.stringify(record, null, 2), 'utf8');
  pruneLogs(gameType);
  return record;
}

function pruneLogs(gameType = '') {
  const files = getLogFiles(gameType);
  files.slice(MAX_LOGS).forEach((file) => fs.unlinkSync(file.fullPath));
}

function readGameLogs(gameType = '') {
  const files = gameType
    ? [...getLogFiles(gameType), ...getLegacyLogFiles(gameType)]
    : [...GAME_TYPES.flatMap((type) => getLogFiles(type)), ...getLogFiles()];
  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((file) => {
    try {
      const record = JSON.parse(fs.readFileSync(file.fullPath, 'utf8'));
      return {
        filename: file.name,
        savedAt: record.savedAt,
        gameType: record.gameType || normalizeGameType(record.game?.type || record.game?.id),
        game: record.game
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function getLegacyLogFiles(gameType) {
  return getLogFiles().filter((file) => normalizeGameType(file.name) === normalizeGameType(gameType));
}

function getLatestGameLog(gameType = '') {
  return readGameLogs(gameType)[0] || null;
}

function readRealGameLogs(gameType = 'consensus') {
  return readGameLogs(gameType).filter((record) => record.game?.mode === 'real' && record.game?.rounds?.length);
}

function getRandomRealGameLog(excludeGameId, gameType = 'consensus') {
  const logs = readRealGameLogs(gameType);
  if (!logs.length) return null;

  const candidates = logs.length > 1
    ? logs.filter((record) => record.game?.id !== excludeGameId)
    : logs;
  const pool = candidates.length ? candidates : logs;
  return pool[Math.floor(Math.random() * pool.length)];
}

function normalizeGameType(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('debate')) return 'debate';
  if (text.includes('werewolf')) return 'werewolf';
  return 'consensus';
}

module.exports = {
  saveGameLog,
  readGameLogs,
  getLatestGameLog,
  readRealGameLogs,
  getRandomRealGameLog
};
