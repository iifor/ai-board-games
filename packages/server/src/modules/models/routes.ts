import { crudController, crudRoutes } from '../../utils/crud';
import type { ModelService } from './service';
import { modelSchema } from './validator';

export function modelRoutes(service: ModelService) {
  return crudRoutes(crudController(service, { create: modelSchema, update: modelSchema }));
}
