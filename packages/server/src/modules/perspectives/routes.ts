import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import { parseQuery } from '../../utils/validate';
import type { perspectiveService } from './service';

const page = z.object({ offset: z.coerce.number().int().nonnegative().default(0), limit: z.coerce.number().int().min(1).max(100).default(30) });
export function perspectiveRoutes(service: ReturnType<typeof perspectiveService>) {
  return new Hono<AppEnv>()
    .use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); })
    .get('/actions', c => ok(c, service.actions()))
    .get('/matches', async c => {
      const { offset, limit } = parseQuery(c, page);
      return ok(c, await service.matches(offset, limit));
    })
    .get('/matches/:id', async c => ok(c, await service.record(c.req.param('id'))))
    .get('/matches/:id/requests/:request', async c => ok(c, await service.prompt(c.req.param('id'), c.req.param('request'))));
}
