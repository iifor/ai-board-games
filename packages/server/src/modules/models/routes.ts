import { crudRoutes } from '../../utils/crud';
import { modelController } from './controller';
import type { ModelService } from './service';

export function modelRoutes(service: ModelService) {
  const controller = modelController(service);
  return crudRoutes(controller).post('/:id/test', controller.test);
}
