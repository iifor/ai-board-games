import type { AdminLoginResponse, AdminProfile } from '@battle/shared';
import { sign, verify } from 'hono/jwt';
import type { AppConfig } from '../../config/env';
import type { AdminIdentity } from '../../types';
import { hashPassword, verifyPassword } from '../../utils/crypto';
import { badRequest, tooManyRequests, unauthorized } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { FAILED_LOGIN_WINDOW_MS, MAX_FAILED_LOGINS, TOKEN_TTL_SECONDS } from './constants';
import type { AuthRepository } from './repository';

interface FailedLogins {
  count: number;
  since: number;
}

export function createAuthService(repository: AuthRepository, config: Pick<AppConfig, 'jwtSecret' | 'bootstrapAdmin'>) {
  const failures = new Map<string, FailedLogins>();

  function assertNotLocked(username: string, now: number): void {
    const entry = failures.get(username);
    if (entry && now - entry.since < FAILED_LOGIN_WINDOW_MS && entry.count >= MAX_FAILED_LOGINS) {
      throw tooManyRequests('登录失败次数过多，请稍后再试');
    }
  }

  function recordFailure(username: string, now: number): void {
    const entry = failures.get(username);
    failures.set(username, !entry || now - entry.since >= FAILED_LOGIN_WINDOW_MS ? { count: 1, since: now } : { ...entry, count: entry.count + 1 });
  }

  return {
    /** 管理员表为空时用配置创建首个账号（首次登录必须改密）；已有账号时不做任何事 */
    async bootstrap(): Promise<void> {
      if ((await repository.count()) > 0) return;
      if (!config.bootstrapAdmin) {
        logger.warn('没有管理员账号，且未配置 ADMIN_USERNAME / ADMIN_PASSWORD，后台暂时无法登录');
        return;
      }
      await repository.create(config.bootstrapAdmin.username, await hashPassword(config.bootstrapAdmin.password));
      logger.info('已创建初始管理员账号', { username: config.bootstrapAdmin.username });
    },

    async login(username: string, password: string, now = Date.now()): Promise<AdminLoginResponse> {
      assertNotLocked(username, now);
      const user = await repository.findByUsername(username);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        recordFailure(username, now);
        throw unauthorized('用户名或密码错误');
      }
      failures.delete(username);
      const exp = Math.floor(now / 1000) + TOKEN_TTL_SECONDS;
      const token = await sign({ sub: user.id, exp }, config.jwtSecret, 'HS256');
      return { token, expiresAt: new Date(exp * 1000).toISOString(), mustChangePassword: user.mustChangePassword };
    },

    /** 校验令牌并读取最新的账号状态（改密状态以数据库为准） */
    async authenticate(token: string): Promise<AdminIdentity> {
      let subject: unknown;
      try {
        subject = (await verify(token, config.jwtSecret, 'HS256')).sub;
      } catch {
        throw unauthorized('登录已失效，请重新登录');
      }
      const user = typeof subject === 'number' ? await repository.findById(subject) : undefined;
      if (!user) throw unauthorized('登录已失效，请重新登录');
      return { id: user.id, username: user.username, mustChangePassword: user.mustChangePassword };
    },

    async changePassword(id: number, currentPassword: string, newPassword: string): Promise<void> {
      const user = await repository.findById(id);
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest('当前密码不正确');
      if (currentPassword === newPassword) throw badRequest('新密码不能与当前密码相同');
      await repository.updatePassword(id, await hashPassword(newPassword));
    },

    profile(identity: AdminIdentity): AdminProfile {
      return { id: identity.id, username: identity.username, mustChangePassword: identity.mustChangePassword };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
