import { Router } from 'express';
import * as ctrl from './controller';
import { validate } from '../../middlewares/validate';
import { setDefaultHostSchema } from './validator';

const router = Router();
router.get('/settings', ctrl.getSettings);
router.put('/settings/default-host', validate(setDefaultHostSchema), ctrl.setDefaultHost);

export default router;
