import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { createMatchController } from './controller';
import type { MatchService } from './service';

/** C 端：开局、历史、对局概要（实时推送走 WebSocket） */
export function publicMatchRoutes(service: MatchService) {
  const controller = createMatchController(service);
  return new Hono<AppEnv>()
    .post('/', controller.createPublic)
    .get('/', controller.history)
    .get('/:id', controller.summary);
}

/** 后台：全部对局、调试局、完整日志、AI 调用记录、调试指令 */
export function adminMatchRoutes(service: MatchService) {
  const controller = createMatchController(service);
  return new Hono<AppEnv>()
    .get('/', controller.adminList)
    .post('/', controller.adminCreate)
    .get('/:id', controller.detail)
    .get('/:id/log', controller.log)
    .get('/:id/ai-calls', controller.aiCalls)
    .post('/:id/debug', controller.debug)
    .delete('/:id', controller.remove);
}
