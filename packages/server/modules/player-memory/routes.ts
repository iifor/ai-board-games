import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import * as controller from './controller';
import { clearPlayerMemoriesSchema, listPlayerMemoriesSchema } from './validator';

const router = Router();
router.get('/player-memories', validate(listPlayerMemoriesSchema, 'query'), controller.listMemories);
router.get('/player-memories/stats', controller.getStats);
router.post('/player-memories/clear', validate(clearPlayerMemoriesSchema), controller.clearMemories);

export default router;
