const { Router } = require('express');
const ctrl = require('./controller');
const { validate } = require('../../middlewares/validate');
const { createVoiceSchema, updateVoiceSchema } = require('./validator');

const router = Router();
router.get('/voice-packages', ctrl.getVoices);
router.get('/voice-packages/:id', ctrl.getVoice);
router.post('/voice-packages', validate(createVoiceSchema), ctrl.createVoice);
router.put('/voice-packages/:id', validate(updateVoiceSchema), ctrl.updateVoice);
router.delete('/voice-packages/:id', ctrl.deleteVoice);
router.post('/voice-packages/:id/preview', ctrl.previewVoice);

module.exports = router;
