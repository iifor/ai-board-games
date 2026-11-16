import { API_ERROR_CODES } from '@battle/shared';
import type { MiddlewareHandler } from 'hono';
import type { Context } from 'hono';
import type { AccessCodeService } from '../modules/access-codes/service';
import type { AuthService } from '../modules/auth/service';
import type { AppEnv } from '../types';
import { AppError, unauthorized } from '../utils/errors';

function bearerToken(c: Context<AppEnv>): string {
  const header = c.req.header('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

/** 后台接口鉴权；未改初始密码的账号只能访问 allowPasswordChange 的接口 */
export function requireAdmin(auth: AuthService, options: { readonly allowPasswordChange?: boolean } = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = bearerToken(c);
    if (!token) throw unauthorized();
    const admin = await auth.authenticate(token);
    if (admin.mustChangePassword && !options.allowPasswordChange) {
      throw new AppError(403, API_ERROR_CODES.passwordChangeRequired, '请先修改初始密码');
    }
    c.set('admin', admin);
    await next();
  };
}

/** C 端开局凭证：由身份码换取，只能用于 C 端接口，后台令牌不能当作凭证 */
export function requireAccess(access: AccessCodeService): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = bearerToken(c);
    if (!token) throw unauthorized('请先输入身份码');
    c.set('access', await access.authenticate(token));
    await next();
  };
}
