import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import { parseJson, parseQuery } from '../../utils/validate';
import type { MatchService } from './service';
import { adminListQuerySchema, createDebugMatchSchema, createMatchSchema, debugCommandSchema, listQuerySchema } from './validator';

const matchId = (c: Context<AppEnv>) => c.req.param('id') ?? '';

export function createMatchController(service: MatchService) {
  return {
    createPublic: async (c: Context<AppEnv>) =>
      ok(c, await service.createPublic(await parseJson(c, createMatchSchema), c.get('access')), 201),
    history: async (c: Context<AppEnv>) => {
      const { limit } = parseQuery(c, listQuerySchema);
      return ok(c, await service.list({ debug: false, status: 'completed', limit }));
    },
    summary: async (c: Context<AppEnv>) => ok(c, await service.publicSummary(matchId(c))),

    adminList: async (c: Context<AppEnv>) => {
      const { limit, offset, status, debug, source } = parseQuery(c, adminListQuerySchema);
      return ok(c, await service.list({ limit, offset, ...(status ? { status } : {}), ...(source ? { source } : {}), ...(debug === undefined ? {} : { debug }) }));
    },
    adminCreate: async (c: Context<AppEnv>) => ok(c, await service.createDebug(await parseJson(c, createDebugMatchSchema)), 201),
    detail: async (c: Context<AppEnv>) => ok(c, await service.detail(matchId(c))),
    log: async (c: Context<AppEnv>) => ok(c, await service.log(matchId(c))),
    aiCalls: async (c: Context<AppEnv>) => {
      c.header('Cache-Control', 'private, no-store');
      return ok(c, await service.aiCalls(matchId(c)));
    },
    debug: async (c: Context<AppEnv>) => {
      const { command } = await parseJson(c, debugCommandSchema);
      return ok(c, await service.debugCommand(matchId(c), command));
    },
    remove: async (c: Context<AppEnv>) => {
      await service.remove(matchId(c));
      return ok(c, null);
    },
  };
}
