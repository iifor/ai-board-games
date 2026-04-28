const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');
const MAX_LOGS = 20;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFiles() {
  ensureLogDir();
  return fs.readdirSync(LOG_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const fullPath = path.join(LOG_DIR, name);
      return {
        name,
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function saveGameLog(game) {
  ensureLogDir();
  const safeId = String(game.id || Date.now()).replace(/[^\w.-]+/g, '-');
  const filename = `${Date.now()}-${safeId}.json`;
  const fullPath = path.join(LOG_DIR, filename);
  const record = {
    savedAt: new Date().toISOString(),
    game
  };

  fs.writeFileSync(fullPath, JSON.stringify(record, null, 2), 'utf8');
  pruneLogs();
  return record;
}

function pruneLogs() {
  const files = getLogFiles();
  files.slice(MAX_LOGS).forEach((file) => fs.unlinkSync(file.fullPath));
}

function readGameLogs() {
  return getLogFiles().map((file) => {
    try {
      const record = JSON.parse(fs.readFileSync(file.fullPath, 'utf8'));
      return {
        filename: file.name,
        savedAt: record.savedAt,
        game: record.game
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function getLatestGameLog() {
  return readGameLogs()[0] || null;
}

function readRealGameLogs() {
  return readGameLogs().filter((record) => record.game?.mode === 'real' && record.game?.rounds?.length);
}

function getRandomRealGameLog(excludeGameId) {
  const logs = readRealGameLogs();
  if (!logs.length) return null;

  const candidates = logs.length > 1
    ? logs.filter((record) => record.game?.id !== excludeGameId)
    : logs;
  const pool = candidates.length ? candidates : logs;
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  saveGameLog,
  readGameLogs,
  getLatestGameLog,
  readRealGameLogs,
  getRandomRealGameLog
};
