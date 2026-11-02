import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { crudController } from '../../utils/crud';
import { parseId } from '../../utils/ids';
import { ok } from '../../utils/response';
import type { ModelService } from './service';
import { modelSchema } from './validator';

export function modelController(service: ModelService) {
  return {
    ...crudController(service, { create: modelSchema, update: modelSchema }),
    test: async (c: Context<AppEnv>) => ok(c, await service.test(parseId(c.req.param('id')))),
  };
}
