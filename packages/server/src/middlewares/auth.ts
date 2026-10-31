import { API_ERROR_CODES } from '@battle/shared';
import type { MiddlewareHandler } from 'hono';
import type { AuthService } from '../modules/auth/service';
import type { AppEnv } from '../types';
import { AppError, unauthorized } from '../utils/errors';

/** 后台接口鉴权；未改初始密码的账号只能访问 allowPasswordChange 的接口 */
export function requireAdmin(auth: AuthService, options: { readonly allowPasswordChange?: boolean } = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) throw unauthorized();
    const admin = await auth.authenticate(token);
    if (admin.mustChangePassword && !options.allowPasswordChange) {
      throw new AppError(403, API_ERROR_CODES.passwordChangeRequired, '请先修改初始密码');
    }
    c.set('admin', admin);
    await next();
  };
}
