import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import { requestSource } from '../../utils/source';
import { parseJson } from '../../utils/validate';
import type { AuthService } from './service';
import { changePasswordSchema, loginSchema } from './validator';

export interface AuthControllerOptions {
  /** 只有部署在可信反向代理之后才相信 X-Forwarded-For 作为锁定来源 */
  readonly trustProxy: boolean;
}

export function createAuthController(service: AuthService, options: AuthControllerOptions) {
  return {
    login: async (c: Context<AppEnv>) => {
      const { username, password } = await parseJson(c, loginSchema);
      return ok(c, await service.login(username, password, requestSource(c, options.trustProxy)));
    },
    changePassword: async (c: Context<AppEnv>) => {
      const { currentPassword, newPassword } = await parseJson(c, changePasswordSchema);
      await service.changePassword(c.get('admin').id, currentPassword, newPassword);
      return ok(c, null);
    },
    me: (c: Context<AppEnv>) => ok(c, service.profile(c.get('admin'))),
  };
}
