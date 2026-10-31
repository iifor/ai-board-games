import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import type { GameService } from './service';

export function gameRoutes(service: GameService) {
  return new Hono<AppEnv>().get('/', (c) => ok(c, service.catalog()));
}

/** 后台：游戏阶段图 */
export function adminGameRoutes(service: GameService) {
  return new Hono<AppEnv>().get('/:key/phases', (c) => ok(c, service.phaseGraph(c.req.param('key'))));
}
