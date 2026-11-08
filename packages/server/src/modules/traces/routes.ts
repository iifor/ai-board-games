import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import { parseQuery, parseWith } from '../../utils/validate';
import { listQuerySchema } from '../matches/validator';
import type { TraceService } from './service';

const listSchema = listQuerySchema.pick({ limit: true, status: true }).extend({
  offset: z.coerce.number().int().min(0).max(2147483647).default(0),
  gameKey: z.string().min(1).max(64).optional(),
});
const idSchema = z.coerce.number().int().positive().max(2147483647);

export function traceRoutes(service: TraceService) {
  return new Hono<AppEnv>()
    .use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); })
    .delete('/:id', async (c) => { await service.remove(c.req.param('id')); return ok(c, null); })
    .get('/', async (c) => ok(c, await service.list(parseQuery(c, listSchema))))
    .get('/:id', async (c) => ok(c, await service.overview(c.req.param('id'))))
    .get('/:id/nodes/:node', async (c) => ok(c, await service.node(c.req.param('id'), parseWith(idSchema, c.req.param('node')))));
}
