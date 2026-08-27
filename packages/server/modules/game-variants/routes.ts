import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import * as controller from './controller';
import { createVariantSchema, idSchema, listVariantSchema, updateVariantSchema } from './validator';

const router = Router();
router.get('/game-variants', validate(listVariantSchema, 'query'), controller.listVariants);
router.get('/game-variants/:id', validate(idSchema, 'params'), controller.getVariant);
router.post('/game-variants', validate(createVariantSchema), controller.createVariant);
router.put('/game-variants/:id', validate(idSchema, 'params'), validate(updateVariantSchema), controller.updateVariant);
router.delete('/game-variants/:id', validate(idSchema, 'params'),
  validate(updateVariantSchema.pick({ revision: true })), controller.disableVariant);

export default router;
