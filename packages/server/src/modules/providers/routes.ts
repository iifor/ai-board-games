import { crudController, crudRoutes } from '../../utils/crud';
import type { ProviderService } from './service';
import { createProviderSchema, updateProviderSchema } from './validator';

export function providerRoutes(service: ProviderService) {
  return crudRoutes(crudController(service, { create: createProviderSchema, update: updateProviderSchema }));
}
