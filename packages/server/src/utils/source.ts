import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { AppEnv } from '../types';

/**
 * 限流与登录锁定用的来源标识。
 * 只有部署在可信反向代理之后才相信 X-Forwarded-For，否则任何人换个请求头就能绕过限流或锁定别人。
 */
export function requestSource(c: Context<AppEnv>, trustProxy: boolean): string {
  const forwarded = trustProxy ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
