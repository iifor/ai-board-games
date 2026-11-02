import type { AdminLoginResponse, AdminProfile } from '@battle/shared';
import { sign, verify } from 'hono/jwt';
import type { AppConfig } from '../../config/env';
import type { AdminIdentity } from '../../types';
import { hashPassword, verifyPassword } from '../../utils/crypto';
import { badRequest, tooManyRequests, unauthorized } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { createWindowCounter } from '../../utils/windowCounter';
import { FAILED_LOGIN_WINDOW_MS, MAX_FAILED_LOGINS, MAX_FAILED_LOGINS_PER_SOURCE, TOKEN_TTL_SECONDS } from './constants';
import type { AuthRepository } from './repository';

export function createAuthService(repository: AuthRepository, config: Pick<AppConfig, 'jwtSecret' | 'bootstrapAdmin'>) {
  /** 进程内计数：来源 + 用户名 的失败次数，以及来源的累计失败次数；过期条目会被清理 */
  const accountFailures = createWindowCounter(FAILED_LOGIN_WINDOW_MS);
  const sourceFailures = createWindowCounter(FAILED_LOGIN_WINDOW_MS);
  const accountKey = (source: string, username: string) => `${source}\u0000${username}`;

  function assertNotLocked(source: string, username: string, now: number): void {
    const locked = accountFailures.count(accountKey(source, username), now) >= MAX_FAILED_LOGINS
      || sourceFailures.count(source, now) >= MAX_FAILED_LOGINS_PER_SOURCE;
    if (locked) throw tooManyRequests('登录失败次数过多，请稍后再试');
  }

  function recordFailure(source: string, username: string, now: number): void {
    accountFailures.record(accountKey(source, username), now);
    sourceFailures.record(source, now);
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

    /** source 是请求来源（连接地址或可信代理给出的地址），锁定按来源 + 用户名计 */
    async login(username: string, password: string, source: string, now = Date.now()): Promise<AdminLoginResponse> {
      assertNotLocked(source, username, now);
      const user = await repository.findByUsername(username);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        recordFailure(source, username, now);
        throw unauthorized('用户名或密码错误');
      }
      accountFailures.clear(accountKey(source, username));
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
