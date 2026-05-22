const { Router } = require('express');
const ctrl = require('./controller');
const { validate } = require('../../middlewares/validate');
const { createModelProviderSchema, updateModelProviderSchema } = require('./validator');

const router = Router();

router.get('/model-providers', ctrl.getModelProviders);
router.get('/model-providers/:id', ctrl.getModelProvider);
router.post('/model-providers', validate(createModelProviderSchema), ctrl.createModelProvider);
router.put('/model-providers/:id', validate(updateModelProviderSchema), ctrl.updateModelProvider);
router.delete('/model-providers/:id', ctrl.deleteModelProvider);

module.exports = router;
