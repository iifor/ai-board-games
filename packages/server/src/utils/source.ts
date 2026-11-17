import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { AppEnv } from '../types';

/**
 * 限流与登录锁定用的来源标识。
 * 只有部署在可信反向代理之后才相信 X-Forwarded-For，否则任何人换个请求头就能绕过限流或锁定别人。
 * 只取最右一项：代理把它看到的对端地址追加在末尾，左侧各项都可能是客户端自己伪造后带进来的。
 * 只支持一层可信代理；前面再套 CDN 等多层代理时需要按跳数取值。
 */
export function requestSource(c: Context<AppEnv>, trustProxy: boolean): string {
  const forwarded = trustProxy ? c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() : undefined;
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
