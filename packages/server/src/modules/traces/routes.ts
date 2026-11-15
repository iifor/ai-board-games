import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import { parseJson, parseQuery, parseWith } from '../../utils/validate';
import type { ComparisonService } from './comparisonService';
import type { PromptComparisonInput } from '@battle/shared';
import { listQuerySchema } from '../matches/validator';
import type { TraceService } from './service';

const listSchema = listQuerySchema.pick({ limit: true, status: true }).extend({
  offset: z.coerce.number().int().min(0).max(2147483647).default(0),
  gameKey: z.string().min(1).max(64).optional(),
});
const idSchema = z.coerce.number().int().positive().max(2147483647);
const keySchema = z.string().min(1).max(256);
const compareInput = z.strictObject({
  persona: z.string().trim().max(2000),
  instruction: z.string().trim().min(1).max(32000),
  taskTemplate: z.string().trim().min(1).max(32000).optional(),
  model: z.union([z.strictObject({ callId: z.number().int().positive() }), z.strictObject({ modelId: z.number().int().positive() })]),
}) satisfies z.ZodType<PromptComparisonInput>;
const comparisonPath = '/:id/requests/:request/comparisons';

export function traceRoutes(service: TraceService, comparisons: ComparisonService) {
  return new Hono<AppEnv>()
    .use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); })
    .get(comparisonPath, async c => ok(c, await comparisons.context(c.req.param('id'), parseWith(keySchema, c.req.param('request')))))
    .post(comparisonPath, async c => ok(c, await comparisons.run(c.req.param('id'), parseWith(keySchema, c.req.param('request')), await parseJson(c, compareInput))))
    .post(`${comparisonPath}/:comparison/apply`, async c => ok(c, await comparisons.publish(c.req.param('id'),
      parseWith(keySchema, c.req.param('request')), parseWith(idSchema, c.req.param('comparison')))))
    .delete('/:id', async (c) => { await service.remove(c.req.param('id')); return ok(c, null); })
    .get('/', async (c) => ok(c, await service.list(parseQuery(c, listSchema))))
    .get('/:id', async (c) => ok(c, await service.overview(c.req.param('id'))))
    .get('/:id/nodes/:node', async (c) => ok(c, await service.node(c.req.param('id'), parseWith(idSchema, c.req.param('node')))));
}
