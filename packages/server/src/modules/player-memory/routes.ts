import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { parseQuery, parseWith } from '../../utils/validate';
import { ok } from '../../utils/response';
import type { memoryReader } from './readRepository';
import type { memoryEraser } from './forgetRepository';

const id = z.coerce.number().int().positive();
const page = z.object({ offset: z.coerce.number().int().nonnegative().default(0), limit: id.max(50).default(15),
  gameKey: z.string().min(1).max(100).optional(), subjectId: id.optional() });

export function memoryRoutes(service: ReturnType<typeof memoryReader> & { forget: ReturnType<typeof memoryEraser> }) {
  return new Hono<AppEnv>().get('/players/:id/calls', async c => {
    c.header('Cache-Control', 'private, no-store');
    const owner = parseWith(id, c.req.param('id'));
    const { offset, limit } = parseQuery(c, page.pick({ offset: true, limit: true }));
    return ok(c, await service.calls(owner, offset, limit));
  }).get('/players/:id', async c => {
    c.header('Cache-Control', 'private, no-store');
    const owner = parseWith(id, c.req.param('id'));
    const { offset, limit, gameKey, subjectId } = parseQuery(c, page);
    return ok(c, await service.player(owner, offset, limit, gameKey, subjectId));
  }).delete('/players/:id', async c => ok(c, await service.forget(parseWith(id, c.req.param('id')))))
    .delete('/players/:id/memories/:memoryId', async c => ok(c,
      await service.forget(parseWith(id, c.req.param('id')), parseWith(id, c.req.param('memoryId')))));
}
