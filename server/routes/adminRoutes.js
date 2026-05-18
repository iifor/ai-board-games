const express = require('express');
const {
  createModel,
  createPlayer,
  createSkin,
  createVoicePackage,
  deleteGame,
  deleteModel,
  deletePlayer,
  deleteSkin,
  deleteVoicePackage,
  deleteWerewolfMode,
  deleteWerewolfRole,
  getAdminStats,
  getAppSettings,
  getGame,
  getModel,
  getPlayer,
  getRuntimeModel,
  getSkin,
  getVoicePackage,
  getWerewolfMode,
  getWerewolfRole,
  importGameRecord,
  importMarkdownSkins,
  importSkinJson,
  listGames,
  listModels,
  listPlayers,
  listSkins,
  listVoicePackages,
  listWerewolfModes,
  listWerewolfRoles,
  reorderPlayers,
  setDefaultHostPlayerId,
  setPlayerEnabled,
  setSkinEnabled,
  updateModel,
  updatePlayer,
  updateSkin,
  updateVoicePackage,
  upsertWerewolfMode,
  upsertWerewolfRole
} = require('../adminStore');
const { callModelChat, testModelConnection } = require('../openaiChat');
const { getResourcePreloadTask, startGameResourcePreload } = require('../services/resources/gameResourcePreloader');
const { synthesizeVoicePreview } = require('../voicePreview');
const { saveUploadedImage } = require('../uploadStore');

const router = express.Router();

router.get('/stats', (request, response) => {
  response.json(getAdminStats());
});

router.get('/skins', (request, response) => {
  response.json(listSkins({ enabledOnly: request.query.enabled === 'true' }));
});

router.get('/skins/:id', (request, response) => {
  const skin = getSkin(request.params.id);
  if (!skin) return notFound(response, 'SKIN_NOT_FOUND', '皮肤不存在');
  response.json(skin);
});

router.post('/skins', handle((request, response) => {
  response.status(201).json(createSkin(request.body || {}));
}));

router.put('/skins/:id', handle((request, response) => {
  response.json(updateSkin(request.params.id, request.body || {}));
}));

router.patch('/skins/:id/enabled', handle((request, response) => {
  response.json(setSkinEnabled(request.params.id, Boolean(request.body?.enabled)));
}));

router.delete('/skins/:id', handle((request, response) => {
  response.json(deleteSkin(request.params.id));
}));

router.post('/skins/import-markdown', handle((request, response) => {
  response.json(importMarkdownSkins());
}));

router.post('/skins/import-json', handle((request, response) => {
  response.status(201).json(importSkinJson(request.body || {}));
}));

router.post('/uploads/image', handle((request, response) => {
  response.status(201).json(saveUploadedImage(request.body || {}));
}));

router.get('/players', (request, response) => {
  response.json(listPlayers({ enabledOnly: request.query.enabled === 'true' }));
});

router.get('/settings', (request, response) => {
  response.json(getAppSettings());
});

router.put('/settings/default-host', handle((request, response) => {
  response.json(setDefaultHostPlayerId(request.body?.playerId ?? null));
}));

router.get('/players/:id', (request, response) => {
  const player = getPlayer(request.params.id);
  if (!player) return notFound(response, 'PLAYER_NOT_FOUND', '玩家不存在');
  response.json(player);
});

router.post('/players', handle((request, response) => {
  response.status(201).json(createPlayer(request.body || {}));
}));

router.put('/players/:id', handle((request, response) => {
  response.json(updatePlayer(request.params.id, request.body || {}));
}));

router.patch('/players/:id/enabled', handle((request, response) => {
  response.json(setPlayerEnabled(request.params.id, Boolean(request.body?.enabled)));
}));

router.patch('/players/reorder', handle((request, response) => {
  response.json(reorderPlayers(request.body?.players || request.body || []));
}));

router.delete('/players/:id', handle((request, response) => {
  response.json(deletePlayer(request.params.id));
}));

router.post('/players/:id/debug-chat', asyncHandle(async (request, response) => {
  const player = getPlayer(request.params.id);
  if (!player) return notFound(response, 'PLAYER_NOT_FOUND', '玩家不存在');
  if (!player.modelId) throw new Error('玩家未绑定模型，无法调试对话。');
  const model = getRuntimeModel(player.modelId);
  if (!model) throw new Error('玩家绑定的模型不存在。');
  if (!model.enabled) throw new Error('玩家绑定的模型已停用。');
  if (!model.apiKey) throw new Error('玩家绑定的模型缺少 API Key。');

  const history = Array.isArray(request.body?.history) ? request.body.history.slice(-12) : [];
  const message = String(request.body?.message || '').trim();
  if (!message) throw new Error('请输入调试消息。');
  const messages = [
    {
      role: 'system',
      content: `你正在扮演 AI 玩家「${player.nickname || player.name}」。请始终保持这个玩家的人格、语气和表达方式。\n性别：${player.sex || '未知'}\n人格：${player.personality || '无'}`
    },
    ...history.map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content || '')
    })).filter((item) => item.content),
    { role: 'user', content: message }
  ];
  const reply = await callModelChat({
    ...model,
    model: model.name,
    messages,
    temperature: 0.85,
    maxTokens: 360
  });
  response.json({
    reply,
    player: {
      id: player.id,
      nickname: player.nickname,
      personality: player.personality,
      voicePackageId: player.voicePackageId
    },
    model: {
      id: model.id,
      provider: model.provider,
      name: model.name,
      apiFormat: model.apiFormat
    }
  });
}));

router.get('/models', (request, response) => {
  response.json(listModels());
});

router.get('/models/:id', (request, response) => {
  const model = getModel(request.params.id);
  if (!model) return notFound(response, 'MODEL_NOT_FOUND', '模型不存在');
  response.json(model);
});

router.post('/models', handle((request, response) => {
  response.status(201).json(createModel(request.body || {}));
}));

router.put('/models/:id', handle((request, response) => {
  response.json(updateModel(request.params.id, request.body || {}));
}));

router.post('/models/:id/test', asyncHandle(async (request, response) => {
  const model = getRuntimeModel(request.params.id);
  if (!model) return notFound(response, 'MODEL_NOT_FOUND', '模型不存在');
  response.json(await testModelConnection({ ...model, model: model.name }));
}));

router.delete('/models/:id', handle((request, response) => {
  response.json(deleteModel(request.params.id));
}));

router.get('/voice-packages', (request, response) => {
  response.json(listVoicePackages());
});

router.get('/voice-packages/:id', (request, response) => {
  const voice = getVoicePackage(request.params.id);
  if (!voice) return notFound(response, 'VOICE_PACKAGE_NOT_FOUND', '语音包不存在');
  response.json(voice);
});

router.post('/voice-packages', handle((request, response) => {
  response.status(201).json(createVoicePackage(request.body || {}));
}));

router.put('/voice-packages/:id', handle((request, response) => {
  response.json(updateVoicePackage(request.params.id, request.body || {}));
}));

router.post('/voice-packages/:id/preview', asyncHandle(async (request, response) => {
  const voice = getVoicePackage(request.params.id);
  if (!voice) return notFound(response, 'VOICE_PACKAGE_NOT_FOUND', '语音包不存在');
  const audio = await synthesizeVoicePreview(voice, request.body?.text);
  response.setHeader('Content-Type', audio.mimeType);
  response.setHeader('Cache-Control', 'no-store');
  response.send(audio.buffer);
}));

router.delete('/voice-packages/:id', handle((request, response) => {
  response.json(deleteVoicePackage(request.params.id));
}));

router.get('/werewolf-roles', (request, response) => {
  response.json(listWerewolfRoles({ enabledOnly: request.query.enabled === 'true' }));
});

router.get('/werewolf-roles/:id', (request, response) => {
  const role = getWerewolfRole(request.params.id);
  if (!role) return notFound(response, 'WEREWOLF_ROLE_NOT_FOUND', '狼人杀角色不存在');
  response.json(role);
});

router.post('/werewolf-roles', handle((request, response) => {
  response.status(201).json(upsertWerewolfRole(request.body || {}));
}));

router.put('/werewolf-roles/:id', handle((request, response) => {
  response.json(upsertWerewolfRole({ ...(request.body || {}), id: request.params.id }));
}));

router.delete('/werewolf-roles/:id', handle((request, response) => {
  response.json(deleteWerewolfRole(request.params.id));
}));

router.get('/werewolf-modes', (request, response) => {
  response.json(listWerewolfModes());
});

router.get('/werewolf-modes/:id', (request, response) => {
  const mode = getWerewolfMode(request.params.id);
  if (!mode) return notFound(response, 'WEREWOLF_MODE_NOT_FOUND', '狼人杀模式不存在');
  response.json(mode);
});

router.post('/werewolf-modes', handle((request, response) => {
  response.status(201).json(upsertWerewolfMode(request.body || {}));
}));

router.put('/werewolf-modes/:id', handle((request, response) => {
  response.json(upsertWerewolfMode({ ...(request.body || {}), id: request.params.id }));
}));

router.delete('/werewolf-modes/:id', handle((request, response) => {
  response.json(deleteWerewolfMode(request.params.id));
}));

router.get('/games', (request, response) => {
  response.json(listGames({
    gameType: request.query.gameType,
    mode: request.query.mode,
    skinId: request.query.skinId,
    winner: request.query.winner,
    playerId: request.query.playerId
  }));
});

router.post('/games/import', handle((request, response) => {
  response.status(201).json(importGameRecord(request.body || {}));
}));

router.post('/games/:id/preload-resources', handle((request, response) => {
  response.status(202).json(startGameResourcePreload(request.params.id, request.body || {}));
}));

router.get('/resource-preload-tasks/:id', (request, response) => {
  const task = getResourcePreloadTask(request.params.id);
  if (!task) return notFound(response, 'TASK_NOT_FOUND', '资源预加载任务不存在');
  response.json(task);
});

router.get('/games/:id', (request, response) => {
  const game = getGame(request.params.id);
  if (!game) return notFound(response, 'GAME_NOT_FOUND', '对局不存在');
  response.json(game);
});

router.delete('/games/:id', handle((request, response) => {
  response.json(deleteGame(request.params.id));
}));

function notFound(response, error, message) {
  response.status(404).json({ error, message });
}

function handle(fn) {
  return (request, response, next) => {
    try {
      fn(request, response, next);
    } catch (error) {
      const status = error.status || getErrorStatus(error.message);
      response.status(status).json({
        error: 'ADMIN_REQUEST_FAILED',
        message: error.message,
        template: error.template
      });
    }
  };
}

function asyncHandle(fn) {
  return (request, response, next) => {
    Promise.resolve(fn(request, response, next)).catch((error) => {
      const status = error.status || getErrorStatus(error.message);
      response.status(status).json({
        error: 'ADMIN_REQUEST_FAILED',
        message: error.message,
        template: error.template
      });
    });
  };
}

function getErrorStatus(message = '') {
  if (/不存在|not found/i.test(message)) return 404;
  if (/不能删除|已存在/i.test(message)) return 409;
  if (/缺少 AZURE_SPEECH|语音包使用浏览器本地语音/i.test(message)) return 422;
  if (/Azure 语音鉴权失败|Azure 语音合成失败/i.test(message)) return 502;
  return 400;
}

module.exports = router;
