const { Router } = require('express');
const ctrl = require('./controller');
const { validate } = require('../../middlewares/validate');
const { createPlayerSchema, updatePlayerSchema, reorderSchema, debugChatSchema } = require('./validator');

const router = Router();

router.get('/players', ctrl.getPlayers);
router.get('/players/:id', ctrl.getPlayer);
router.post('/players', validate(createPlayerSchema), ctrl.createPlayer);
router.put('/players/:id', validate(updatePlayerSchema), ctrl.updatePlayer);
router.patch('/players/:id/enabled', ctrl.setPlayerEnabled);
router.patch('/players/reorder', validate(reorderSchema), ctrl.reorderPlayers);
router.post('/players/:id/debug-chat', validate(debugChatSchema), ctrl.debugPlayerChat);
router.delete('/players/:id', ctrl.deletePlayer);

module.exports = router;
