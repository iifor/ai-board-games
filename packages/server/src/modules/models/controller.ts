import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { crudController } from '../../utils/crud';
import { parseId } from '../../utils/ids';
import { ok } from '../../utils/response';
import type { ModelService } from './service';
import { importModelsSchema, modelSchema } from './validator';
import { parseJson } from '../../utils/validate';

export function modelController(service: ModelService) {
  return {
    ...crudController(service, { create: modelSchema, update: modelSchema }),
    catalog: async (c: Context<AppEnv>) => ok(c, await service.catalog(parseId(c.req.param('providerId')))),
    importSelected: async (c: Context<AppEnv>) =>
      ok(c, await service.importSelected(parseId(c.req.param('providerId')), await parseJson(c, importModelsSchema))),
    test: async (c: Context<AppEnv>) => ok(c, await service.test(parseId(c.req.param('id')))),
  };
}
