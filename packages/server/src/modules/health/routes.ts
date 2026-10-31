import { API_ERROR_CODES, type ApiFailure } from '@battle/shared';
import { Hono } from 'hono';
import { sql } from 'kysely';
import type { Db } from '../../db/database';
import type { AppEnv } from '../../types';
import { logger } from '../../utils/logger';
import { ok } from '../../utils/response';

/** 健康检查：数据库可用才返回 ok */
export function healthRoutes(db: Db) {
  return new Hono<AppEnv>().get('/', async (c) => {
    try {
      await sql`select 1`.execute(db);
      return ok(c, { status: 'ok' });
    } catch (error) {
      logger.error('health check failed', { error: error instanceof Error ? error.message : String(error) });
      return c.json({ code: API_ERROR_CODES.internal, message: '数据库不可用' } satisfies ApiFailure, 503);
    }
  });
}
