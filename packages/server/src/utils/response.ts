import type { ApiSuccess } from '@battle/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  const body: ApiSuccess<T> = { code: 0, message: 'ok', data };
  return c.json(body, status);
}
