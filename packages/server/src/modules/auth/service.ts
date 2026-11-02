import type { AdminLoginResponse, AdminProfile } from '@battle/shared';
import { sign, verify } from 'hono/jwt';
import type { AppConfig } from '../../config/env';
import type { AdminIdentity } from '../../types';
import { hashPassword, verifyPassword } from '../../utils/crypto';
import { badRequest, tooManyRequests, unauthorized } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { windowKey, type WindowStore } from '../../utils/windowStore';
import { FAILED_LOGIN_WINDOW_MS, MAX_FAILED_LOGINS, MAX_FAILED_LOGINS_PER_SOURCE, TOKEN_TTL_SECONDS } from './constants';
import type { AuthRepository } from './repository';

export function createAuthService(repository: AuthRepository, config: Pick<AppConfig, 'jwtSecret' | 'bootstrapAdmin'>, failures: WindowStore) {
  /** 失败计数放在 WindowStore（数据库）里，多实例共享：来源 + 用户名 一份，来源累计一份 */
  const accountKey = (source: string, username: string) => windowKey('login', source, username);
  const sourceKey = (source: string) => windowKey('login-source', source);

  async function assertNotLocked(source: string, username: string, now: number): Promise<void> {
    const since = new Date(now - FAILED_LOGIN_WINDOW_MS);
    const [account, bySource] = await Promise.all([failures.count(accountKey(source, username), since), failures.count(sourceKey(source), since)]);
    if (account >= MAX_FAILED_LOGINS || bySource >= MAX_FAILED_LOGINS_PER_SOURCE) throw tooManyRequests('登录失败次数过多，请稍后再试');
  }

  async function recordFailure(source: string, username: string, now: number): Promise<void> {
    const at = new Date(now);
    await Promise.all([failures.add(accountKey(source, username), at), failures.add(sourceKey(source), at)]);
  }

  return {
    /**
     * 管理员表为空时用配置创建首个账号（首次登录必须改密）；已有账号时不做任何事。
     * 多实例同时启动：持锁后再查一次，只有一个实例会插入，其余看到已有账号直接返回。
     */
    async bootstrap(): Promise<void> {
      if ((await repository.count()) > 0) return;
      if (!config.bootstrapAdmin) {
        logger.warn('没有管理员账号，且未配置 ADMIN_USERNAME / ADMIN_PASSWORD，后台暂时无法登录');
        return;
      }
      const { username, password } = config.bootstrapAdmin;
      const passwordHash = await hashPassword(password);
      const created = await repository.transaction(async (trx) => {
        await repository.lockBootstrap(trx);
        if ((await repository.count(trx)) > 0) return false;
        await repository.create(username, passwordHash, trx);
        return true;
      });
      if (created) logger.info('已创建初始管理员账号', { username });
    },

    /** source 是请求来源（连接地址或可信代理给出的地址），锁定按来源 + 用户名计 */
    async login(username: string, password: string, source: string, now = Date.now()): Promise<AdminLoginResponse> {
      await assertNotLocked(source, username, now);
      const user = await repository.findByUsername(username);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        await recordFailure(source, username, now);
        throw unauthorized('用户名或密码错误');
      }
      await failures.clear(accountKey(source, username));
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
