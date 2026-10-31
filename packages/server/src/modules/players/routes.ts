import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { crudController, crudRoutes } from '../../utils/crud';
import { ok } from '../../utils/response';
import type { PlayerService } from './service';
import { playerSchema } from './validator';

export function playerRoutes(service: PlayerService) {
  return crudRoutes(crudController(service, { create: playerSchema, update: playerSchema }));
}

/** C 端：只列出启用的玩家及其公开信息 */
export function publicPlayerRoutes(service: PlayerService) {
  return new Hono<AppEnv>().get('/', async (c) => ok(c, await service.listPublic()));
}
