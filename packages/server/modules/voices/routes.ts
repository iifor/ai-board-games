import { Router } from 'express';
import * as ctrl from './controller';
import { validate } from '../../middlewares/validate';
import { createVoiceSchema, updateVoiceSchema } from './validator';

const router = Router();
router.get('/voice-packages', ctrl.getVoices);
router.get('/voice-packages/:id', ctrl.getVoice);
router.post('/voice-packages', validate(createVoiceSchema), ctrl.createVoice);
router.put('/voice-packages/:id', validate(updateVoiceSchema), ctrl.updateVoice);
router.delete('/voice-packages/:id', ctrl.deleteVoice);
router.post('/voice-packages/:id/preview', ctrl.previewVoice);

export default router;
