import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = randomUUID();
  c.set('requestId', id);
  c.header('X-Request-Id', id);
  await next();
};
