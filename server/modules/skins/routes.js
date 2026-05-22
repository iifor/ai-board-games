const { Router } = require('express');
const ctrl = require('./controller');
const { validate } = require('../../middlewares/validate');
const { createSkinSchema, updateSkinSchema, importSkinJsonSchema } = require('./validator');

const router = Router();

router.get('/skins', ctrl.getSkins);
router.get('/skins/:id', ctrl.getSkin);
router.post('/skins', validate(createSkinSchema), ctrl.createSkin);
router.put('/skins/:id', validate(updateSkinSchema), ctrl.updateSkin);
router.patch('/skins/:id/enabled', ctrl.setSkinEnabled);
router.delete('/skins/:id', ctrl.deleteSkin);
router.post('/skins/import-markdown', ctrl.importMarkdownSkins);
router.post('/skins/import-json', validate(importSkinJsonSchema), ctrl.importSkinJson);

module.exports = router;
