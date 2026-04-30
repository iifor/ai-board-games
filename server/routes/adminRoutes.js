const express = require('express');
const {
  createPlayer,
  createSkin,
  deleteGame,
  deletePlayer,
  deleteSkin,
  getAdminStats,
  getGame,
  getPlayer,
  getSkin,
  importMarkdownSkins,
  listGames,
  listPlayers,
  listSkins,
  reorderPlayers,
  setPlayerEnabled,
  setSkinEnabled,
  updatePlayer,
  updateSkin
} = require('../adminStore');

const router = express.Router();

router.get('/stats', (request, response) => {
  response.json(getAdminStats());
});

router.get('/skins', (request, response) => {
  response.json(listSkins({ enabledOnly: request.query.enabled === 'true' }));
});

router.get('/skins/:id', (request, response) => {
  const skin = getSkin(request.params.id);
  if (!skin) {
    response.status(404).json({ error: 'SKIN_NOT_FOUND', message: '皮肤不存在' });
    return;
  }
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

router.get('/players', (request, response) => {
  response.json(listPlayers({ enabledOnly: request.query.enabled === 'true' }));
});

router.get('/players/:id', (request, response) => {
  const player = getPlayer(request.params.id);
  if (!player) {
    response.status(404).json({ error: 'PLAYER_NOT_FOUND', message: '玩家不存在' });
    return;
  }
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

router.get('/games', (request, response) => {
  response.json(listGames({
    mode: request.query.mode,
    skinId: request.query.skinId,
    winner: request.query.winner,
    playerId: request.query.playerId
  }));
});

router.get('/games/:id', (request, response) => {
  const game = getGame(request.params.id);
  if (!game) {
    response.status(404).json({ error: 'GAME_NOT_FOUND', message: '对局不存在' });
    return;
  }
  response.json(game);
});

router.delete('/games/:id', handle((request, response) => {
  response.json(deleteGame(request.params.id));
}));

function handle(fn) {
  return (request, response, next) => {
    try {
      fn(request, response, next);
    } catch (error) {
      const status = /不存在|not found/i.test(error.message) ? 404 : /不能删除|已存在/i.test(error.message) ? 409 : 400;
      response.status(status).json({ error: 'ADMIN_REQUEST_FAILED', message: error.message });
    }
  };
}

module.exports = router;
