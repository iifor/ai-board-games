import { Router } from 'express';
import * as ctrl from './controller';
import { validate } from '../../middlewares/validate';
import { setDefaultHostSchema } from './validator';

const router = Router();
router.get('/settings', ctrl.getSettings);
router.put('/settings/default-host', validate(setDefaultHostSchema), ctrl.setDefaultHost);
router.get('/settings/spectator-mode', ctrl.getSpectatorMode);
router.put('/settings/spectator-mode', ctrl.setSpectatorMode);

export default router;
