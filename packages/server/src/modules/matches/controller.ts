import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import { parseJson, parseQuery } from '../../utils/validate';
import type { MatchService } from './service';
import { createDebugMatchSchema, createMatchSchema, debugCommandSchema, listQuerySchema } from './validator';

/** 限流用的来源标识：优先取反向代理传入的客户端地址 */
function sourceOf(c: Context<AppEnv>): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const matchId = (c: Context<AppEnv>) => c.req.param('id') ?? '';

export function createMatchController(service: MatchService) {
  return {
    createPublic: async (c: Context<AppEnv>) => ok(c, await service.createPublic(await parseJson(c, createMatchSchema), sourceOf(c)), 201),
    history: async (c: Context<AppEnv>) => {
      const { limit } = parseQuery(c, listQuerySchema);
      return ok(c, await service.list({ debug: false, status: 'completed', limit }));
    },
    summary: async (c: Context<AppEnv>) => ok(c, await service.summary(matchId(c))),

    adminList: async (c: Context<AppEnv>) => {
      const { limit, status, debug } = parseQuery(c, listQuerySchema);
      return ok(c, await service.list({ limit, ...(status ? { status } : {}), ...(debug === undefined ? {} : { debug }) }));
    },
    adminCreate: async (c: Context<AppEnv>) => ok(c, await service.createDebug(await parseJson(c, createDebugMatchSchema)), 201),
    detail: async (c: Context<AppEnv>) => ok(c, await service.detail(matchId(c))),
    log: async (c: Context<AppEnv>) => ok(c, await service.log(matchId(c))),
    aiCalls: async (c: Context<AppEnv>) => ok(c, await service.aiCalls(matchId(c))),
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
