import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { ok } from '../../utils/response';
import { parseJson } from '../../utils/validate';
import type { AuthService } from './service';
import { changePasswordSchema, loginSchema } from './validator';

export function createAuthController(service: AuthService) {
  return {
    login: async (c: Context<AppEnv>) => {
      const { username, password } = await parseJson(c, loginSchema);
      return ok(c, await service.login(username, password));
    },
    changePassword: async (c: Context<AppEnv>) => {
      const { currentPassword, newPassword } = await parseJson(c, changePasswordSchema);
      await service.changePassword(c.get('admin').id, currentPassword, newPassword);
      return ok(c, null);
    },
    me: (c: Context<AppEnv>) => ok(c, service.profile(c.get('admin'))),
  };
}
