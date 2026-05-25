import { Router } from 'express';
import * as ctrl from './controller';
import { validate } from '../../middlewares/validate';
import { createModelProviderSchema, updateModelProviderSchema } from './validator';

const router = Router();

router.get('/model-providers', ctrl.getModelProviders);
router.get('/model-providers/:id', ctrl.getModelProvider);
router.post('/model-providers', validate(createModelProviderSchema), ctrl.createModelProvider);
router.put('/model-providers/:id', validate(updateModelProviderSchema), ctrl.updateModelProvider);
router.delete('/model-providers/:id', ctrl.deleteModelProvider);

export default router;
