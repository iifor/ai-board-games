import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { badRequest, notFound } from '../../utils/errors';
import { ok } from '../../utils/response';
import { requestSource } from '../../utils/source';
import { parseJson } from '../../utils/validate';
import type { MatchService } from './service';
import { generatedMatchSchema } from './validator';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1']);

/** 只挂在开发服务。直连请求及 Vite 代理均来自回环地址；不接受转发头作为本机凭证。 */
export function localDebugRoutes(service: MatchService) {
  return new Hono<AppEnv>().post('/', async (c) => {
    const peer = requestSource(c, false);
    const origin = c.req.header('Origin');
    if (!LOOPBACK.has(peer) || !LOOPBACK.has(new URL(c.req.url).hostname)
      || (origin !== undefined && (!URL.canParse(origin) || !LOOPBACK.has(new URL(origin).hostname)))) {
      throw notFound('接口');
    }
    if (c.req.header('Content-Type')?.split(';')[0]?.trim() !== 'application/json') {
      throw badRequest('调试开局需要 JSON 请求');
    }
    const setup = await parseJson(c, generatedMatchSchema);
    return ok(c, await service.createLocalDebug(setup, peer), 201);
  });
}
