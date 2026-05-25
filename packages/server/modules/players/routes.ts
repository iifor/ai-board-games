import { Router } from 'express';
import * as ctrl from './controller';
import { validate } from '../../middlewares/validate';
import { createPlayerSchema, updatePlayerSchema, reorderSchema, debugChatSchema } from './validator';

const router = Router();

router.get('/players', ctrl.getPlayers);
router.get('/players/:id', ctrl.getPlayer);
router.post('/players', validate(createPlayerSchema), ctrl.createPlayer);
router.put('/players/:id', validate(updatePlayerSchema), ctrl.updatePlayer);
router.patch('/players/:id/enabled', ctrl.setPlayerEnabled);
router.patch('/players/reorder', validate(reorderSchema), ctrl.reorderPlayers);
router.post('/players/:id/debug-chat', validate(debugChatSchema), ctrl.debugPlayerChat);
router.delete('/players/:id', ctrl.deletePlayer);

export default router;
