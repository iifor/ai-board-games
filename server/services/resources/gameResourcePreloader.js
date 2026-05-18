const {
  getGame,
  getVoicePackage,
  listPlayers
} = require('../../adminStore');
const { isAzureVoice, prepareVoiceAudio } = require('../audio/audioResourceCache');
const { collectPlayableItems } = require('./playableItems');

const tasks = new Map();

const RESOURCE_PRELOADERS = {
  audio: {
    collect: collectPlayableItems,
    prepare: prepareAudioResource
  }
};

function startGameResourcePreload(gameId, options = {}) {
  const id = String(gameId || '').trim();
  if (!id) throw new Error('缺少对局 ID');

  const existing = [...tasks.values()].find((task) => task.gameId === id && task.status === 'running');
  if (existing) return existing;

  const resourceTypes = normalizeResourceTypes(options.resourceTypes);

  const task = createTask(id, resourceTypes);
  tasks.set(task.id, task);

  runPreloadTask(task).catch((error) => {
    task.status = 'failed';
    task.error = error.message;
    touch(task);
  });

  return task;
}

function getResourcePreloadTask(taskId) {
  return tasks.get(String(taskId || '')) || null;
}

function createTask(gameId, resourceTypes) {
  return {
    id: `resource-preload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    gameId,
    resourceTypes,
    status: 'running',
    total: 0,
    done: 0,
    cached: 0,
    generated: 0,
    skipped: 0,
    failed: 0,
    error: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function runPreloadTask(task) {
  const game = enrichGamePlayers(getGame(task.gameId));
  if (!game) throw new Error('对局不存在');

  const preloaders = task.resourceTypes.map((type) => RESOURCE_PRELOADERS[type]).filter(Boolean);
  const items = preloaders.flatMap((preloader) => preloader.collect(game).map((item) => ({ ...item, preloader })));
  task.total = items.length;
  touch(task);

  for (const item of items) {
    try {
      const prepared = await item.preloader.prepare(game, item);
      if (prepared?.cached) task.cached += 1;
      else if (prepared?.generated) task.generated += 1;
      else task.skipped += 1;
    } catch {
      task.failed += 1;
    } finally {
      task.done += 1;
      touch(task);
    }
  }

  task.status = task.failed ? 'completed_with_errors' : 'completed';
  touch(task);
}

function enrichGamePlayers(game) {
  if (!game) return null;
  const latestPlayers = new Map(listPlayers().map((player) => [Number(player.id), player]));
  return {
    ...game,
    players: (game.players || []).map((player) => {
      const latest = latestPlayers.get(Number(player.id));
      return latest ? { ...player, ...latest, side: player.side, sideIndex: player.sideIndex } : player;
    })
  };
}

function normalizeResourceTypes(resourceTypes) {
  const values = Array.isArray(resourceTypes) && resourceTypes.length ? resourceTypes : ['audio'];
  return [...new Set(values.map((value) => String(value || '').trim()).filter((value) => RESOURCE_PRELOADERS[value]))];
}

async function prepareAudioResource(game, item) {
  const voice = resolveItemVoice(game, item);
  if (!voice) return { skipped: true };

  const prepared = await prepareVoiceAudio(voice, item.text);
  if (prepared?.audioCached) return { cached: true };
  if (prepared?.audioUrl) return { generated: true };
  return { skipped: true };
}

function resolveItemVoice(game, item) {
  const player = (game.players || []).find((candidate) => Number(candidate.id) === Number(item.playerId));
  if (!player?.voicePackageId) return null;

  const voice = getVoicePackage(player.voicePackageId);
  return isAzureVoice(voice) ? voice : null;
}

function touch(task) {
  task.updatedAt = new Date().toISOString();
}

module.exports = {
  getResourcePreloadTask,
  startGameResourcePreload
};
