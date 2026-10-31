import { API_ERROR_CODES, type ApiFailure } from '@battle/shared';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../types';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

function fail(c: Context, status: 400 | 401 | 403 | 404 | 409 | 429 | 500, code: number, message: string): Response {
  const body: ApiFailure = { code, message };
  return c.json(body, status);
}

/** PostgreSQL 约束错误转成可读的业务错误；不暴露约束名、表名等细节 */
function fromDatabase(error: unknown): AppError | null {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === '23505') return new AppError(409, API_ERROR_CODES.conflict, '名称已存在');
  if (code === '23503') return new AppError(409, API_ERROR_CODES.conflict, '引用的资源不存在或仍被使用');
  return null;
}

export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  const known = error instanceof AppError ? error : fromDatabase(error);
  if (known) return c.json({ code: known.code, message: known.message } satisfies ApiFailure, known.status);
  if (error instanceof HTTPException && error.status < 500) {
    return c.json({ code: error.status * 100 + 1, message: error.message } satisfies ApiFailure, error.status);
  }
  logger.error('unhandled error', {
    requestId: c.get('requestId'),
    path: c.req.path,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
  });
  return fail(c, 500, API_ERROR_CODES.internal, '服务器内部错误');
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) => fail(c, 404, API_ERROR_CODES.notFound, '接口不存在');
