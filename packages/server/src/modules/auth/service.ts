import type { AdminLoginResponse, AdminProfile } from '@battle/shared';
import { sign, verify } from 'hono/jwt';
import type { AppConfig } from '../../config/env';
import type { AdminIdentity } from '../../types';
import { hashPassword, verifyPassword } from '../../utils/crypto';
import { badRequest, tooManyRequests, unauthorized } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { windowKey, type WindowStore } from '../../utils/windowStore';
import {
  ADMIN_TOKEN_AUDIENCE, EXPIRED_SESSION, FAILED_LOGIN_WINDOW_MS, MAX_CONCURRENT_PASSWORD_CHECKS, MAX_FAILED_LOGINS, MAX_FAILED_LOGINS_PER_SOURCE, TOKEN_TTL_SECONDS,
} from './constants';
import type { AuthRepository } from './repository';

export function createAuthService(repository: AuthRepository, config: Pick<AppConfig, 'jwtSecret' | 'bootstrapAdmin'>, failures: WindowStore) {
  /** 失败计数放在 WindowStore（数据库）里，多实例共享：来源 + 用户名 一份，来源累计一份 */
  const accountKey = (source: string, username: string) => windowKey('login', source, username);
  const sourceKey = (source: string) => windowKey('login-source', source);
  /** 本实例正在进行的登录校验数 */
  let checksInFlight = 0;

  async function assertNotLocked(source: string, username: string, now: number): Promise<void> {
    const since = new Date(now - FAILED_LOGIN_WINDOW_MS);
    const [account, bySource] = await Promise.all([failures.count(accountKey(source, username), since), failures.count(sourceKey(source), since)]);
    if (account >= MAX_FAILED_LOGINS || bySource >= MAX_FAILED_LOGINS_PER_SOURCE) throw tooManyRequests('登录失败次数过多，请稍后再试');
  }

  async function issue(id: number, generation: number, mustChangePassword: boolean, now: number): Promise<AdminLoginResponse> {
    const exp = Math.floor(now / 1000) + TOKEN_TTL_SECONDS;
    const token = await sign({ sub: id, gen: generation, aud: ADMIN_TOKEN_AUDIENCE, exp }, config.jwtSecret, 'HS256');
    return { token, expiresAt: new Date(exp * 1000).toISOString(), mustChangePassword };
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

    /**
     * source 是请求来源（连接地址或可信代理给出的地址），锁定按来源 + 用户名计。
     * 先占用本实例的校验名额再查锁定：并发请求不能一起越过"先查后记"的窗口（最多多出名额数 - 1 次），
     * 大量并发登录也只会排到 429，不会让 scrypt 占满 libuv 线程池拖慢模型与 TTS 请求。
     */
    async login(username: string, password: string, source: string, now = Date.now()): Promise<AdminLoginResponse> {
      if (checksInFlight >= MAX_CONCURRENT_PASSWORD_CHECKS) throw tooManyRequests('登录请求过多，请稍后再试');
      checksInFlight += 1;
      try {
        await assertNotLocked(source, username, now);
        const user = await repository.findByUsername(username);
        if (!user || !(await verifyPassword(password, user.passwordHash))) {
          await recordFailure(source, username, now);
          throw unauthorized('用户名或密码错误');
        }
        await failures.clear(accountKey(source, username));
        return await issue(user.id, user.tokenGeneration, user.mustChangePassword, now);
      } finally {
        checksInFlight -= 1;
      }
    },

    /**
     * 校验令牌并读取最新的账号状态（改密状态以数据库为准）；只接受后台 audience，C 端凭证不能冒充管理员。
     * 令牌代次必须等于账号当前代次：改密或退出登录后旧令牌立即失效。
     */
    async authenticate(token: string): Promise<AdminIdentity> {
      let payload: Record<string, unknown>;
      try {
        payload = await verify(token, config.jwtSecret, { alg: 'HS256', aud: ADMIN_TOKEN_AUDIENCE });
      } catch {
        throw unauthorized(EXPIRED_SESSION);
      }
      const { sub, gen } = payload;
      if (typeof sub !== 'number' || typeof gen !== 'number') throw unauthorized(EXPIRED_SESSION);
      const user = await repository.findById(sub);
      if (!user || user.tokenGeneration !== gen) throw unauthorized(EXPIRED_SESSION);
      return { id: user.id, username: user.username, mustChangePassword: user.mustChangePassword };
    },

    /** 改密后其他令牌全部失效，返回给当前会话一枚新令牌 */
    async changePassword(id: number, currentPassword: string, newPassword: string, now = Date.now()): Promise<AdminLoginResponse> {
      const user = await repository.findById(id);
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest('当前密码不正确');
      if (currentPassword === newPassword) throw badRequest('新密码不能与当前密码相同');
      const generation = await repository.updatePassword(id, await hashPassword(newPassword));
      return issue(id, generation, false, now);
    },

    /** 退出登录：该账号已签发的令牌全部失效（单管理员场景下即所有设备一起退出） */
    async logout(id: number): Promise<void> {
      await repository.revokeTokens(id);
    },

    profile(identity: AdminIdentity): AdminProfile {
      return { id: identity.id, username: identity.username, mustChangePassword: identity.mustChangePassword };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
