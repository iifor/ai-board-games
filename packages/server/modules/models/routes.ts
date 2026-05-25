import { Router } from 'express';
import * as ctrl from './controller';
import { validate } from '../../middlewares/validate';
import { createModelSchema, updateModelSchema } from './validator';

const router = Router();
router.get('/models', ctrl.getModels);
router.get('/model-providers/:providerId/models', ctrl.getProviderModels);
router.post('/model-providers/:providerId/models', validate(createModelSchema), ctrl.createProviderModel);
router.get('/models/:id', ctrl.getModel);
router.post('/models', validate(createModelSchema), ctrl.createModel);
router.put('/models/:id', validate(updateModelSchema), ctrl.updateModel);
router.delete('/models/:id', ctrl.deleteModel);
router.post('/models/:id/test', ctrl.testModel);

export default router;
