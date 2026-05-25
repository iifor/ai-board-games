import { Router } from 'express';
import * as ctrl from './controller';

const router = Router();
router.get('/settings', ctrl.getSettings);
router.put('/settings/default-host', ctrl.setDefaultHost);

export default router;
