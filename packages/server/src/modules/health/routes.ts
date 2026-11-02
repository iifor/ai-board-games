import { API_ERROR_CODES, type ApiFailure } from '@battle/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import type { HealthService } from './service';

/** 健康检查：数据库可用才返回 ok；instance 是应答实例的 ID */
export function healthRoutes(service: HealthService) {
  return new Hono<AppEnv>().get('/', async (c) => {
    if (await service.databaseReady()) return ok(c, { status: 'ok', instance: service.instanceId });
    return c.json({ code: API_ERROR_CODES.internal, message: '数据库不可用' } satisfies ApiFailure, 503);
  });
}
