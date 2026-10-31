import { crudController, crudRoutes } from '../../utils/crud';
import type { VoiceService } from './service';
import { voiceSchema } from './validator';

export function voiceRoutes(service: VoiceService) {
  return crudRoutes(crudController(service, { create: voiceSchema, update: voiceSchema }));
}
