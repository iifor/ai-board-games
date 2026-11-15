import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import { parseJson } from '../../utils/validate';
import type { CatalogService } from './service';
import { compareInput, previewInput, saveInput } from './validator';

export function catalogRoutes(service: CatalogService) {
  return new Hono<AppEnv>()
    .use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); })
    .get('/', c => ok(c, service.list()))
    .get('/:group/:key', async c => ok(c, await service.detail(c.req.param('group'), c.req.param('key'))))
    .put('/:group/:key', async c => {
      const input = await parseJson(c, saveInput);
      return ok(c, await service.save(c.req.param('group'), c.req.param('key'), input.source, input.revision));
    })
    .post('/:group/:key/preview', async c => {
      const input = await parseJson(c, previewInput);
      return ok(c, await service.preview(c.req.param('group'), c.req.param('key'), input.example, input.source));
    })
    .post('/:group/:key/compare', async c => {
      const input = await parseJson(c, compareInput);
      return ok(c, await service.compare(c.req.param('group'), c.req.param('key'), input.example, input.source, input.modelId));
    });
}
