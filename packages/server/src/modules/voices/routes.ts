import { crudRoutes } from '../../utils/crud';
import { voiceController } from './controller';
import type { VoiceService } from './service';

export function voiceRoutes(service: VoiceService) {
  const controller = voiceController(service);
  return crudRoutes(controller)
    .post('/import-defaults', controller.importDefaults)
    .post('/:id/preview', controller.preview);
}
