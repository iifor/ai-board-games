import { Router } from 'express';
import * as ctrl from './controller';

const router = Router();
router.get('/games', ctrl.listGames);
router.get('/games/:id', ctrl.getGame);
router.delete('/games/:id', ctrl.deleteGame);
router.post('/games/import', ctrl.importGame);
router.get('/stats', ctrl.getStats);

export default router;
