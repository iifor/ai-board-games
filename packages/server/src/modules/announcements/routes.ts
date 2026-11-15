import { ANNOUNCEMENT_TEMPLATE_MAX_LENGTH } from '@battle/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import { parseJson } from '../../utils/validate';
import type { AnnouncementService } from './service';

const text = z.string().trim().min(1).max(ANNOUNCEMENT_TEMPLATE_MAX_LENGTH);
const update = z.strictObject({
  text: text.nullable(),
  revision: z.number().int().min(0).max(2147483646),
});

export function announcementRoutes(service: AnnouncementService) {
  return new Hono<AppEnv>()
    .use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); })
    .get('/', async c => ok(c, await service.list()))
    .post('/:key/preview', async c => {
      const input = await parseJson(c, z.strictObject({ text }));
      return ok(c, service.preview(c.req.param('key'), input.text));
    })
    .put('/:key', async c => ok(c, await service.save(c.req.param('key'), await parseJson(c, update))));
}
