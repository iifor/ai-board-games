const { Router } = require('express');
const ctrl = require('./controller');
const { validate } = require('../../middlewares/validate');
const { createModelSchema, updateModelSchema } = require('./validator');

const router = Router();
router.get('/models', ctrl.getModels);
router.get('/models/:id', ctrl.getModel);
router.post('/models', validate(createModelSchema), ctrl.createModel);
router.put('/models/:id', validate(updateModelSchema), ctrl.updateModel);
router.delete('/models/:id', ctrl.deleteModel);
router.post('/models/:id/test', ctrl.testModel);

module.exports = router;
