import type { AccessCodeDto, AccessCodeInput, AccessCodeSecret, AccessProfile, AccessSessionResponse } from '@battle/shared';
import type { Transaction } from 'kysely';
import { sign, verify } from 'hono/jwt';
import type { AppConfig } from '../../config/env';
import type { Database } from '../../db/schema';
import type { AccessGrant } from '../../types';
import { badRequest, forbidden, notFound, tooManyRequests, unauthorized } from '../../utils/errors';
import { windowKey, type WindowStore } from '../../utils/windowStore';
import {
  ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_MAX_TTL_SECONDS, FAILED_ACCESS_WINDOW_MS, MAX_ACCESS_CODE_DAYS, MAX_FAILED_ACCESS_PER_SOURCE,
} from './constants';
import type { AccessCodeRepository } from './repository';
import type { AccessCodeRow, AccessCodeValues } from './types';
import { codeHint, generateCode, hashCode, normalizeCode, remainingMatches, statusOf, toDto } from './utils';

const EXPIRED_SESSION = '身份码已失效，请重新输入';
const EXHAUSTED = '身份码的可开局数已用完，请联系管理员';

/** 不可用原因对应的错误：停用、过期、凭证过时要求重新输码（401），用完给出明确提示（403） */
function unusable(row: AccessCodeRow | undefined, generation: number | null, now: number) {
  if (!row || (generation !== null && row.generation !== generation)) return unauthorized(EXPIRED_SESSION);
  const status = statusOf(row, now);
  if (status === 'disabled') return unauthorized('身份码已停用，请联系管理员');
  if (status === 'expired') return unauthorized('身份码已过期，请联系管理员');
  if (status === 'exhausted') return forbidden(EXHAUSTED);
  return null;
}

export function createAccessCodeService(
  repository: AccessCodeRepository,
  config: Pick<AppConfig, 'jwtSecret'>,
  failures: WindowStore,
  clock: () => number = Date.now,
) {
  const failureKey = (source: string) => windowKey('access-code', source);

  function values(input: AccessCodeInput, disabled: boolean): AccessCodeValues {
    return { username: input.username, expiresAt: new Date(input.expiresAt), maxMatches: input.maxMatches, disabled };
  }

  function assertExpiryRange(expiresAt: string, now: number): void {
    const at = new Date(expiresAt).getTime();
    if (at > now + MAX_ACCESS_CODE_DAYS * 24 * 60 * 60 * 1000) throw badRequest(`有效期最长 ${MAX_ACCESS_CODE_DAYS} 天`);
  }

  async function issue(row: AccessCodeRow, now: number): Promise<AccessSessionResponse> {
    const exp = Math.min(Math.floor(now / 1000) + ACCESS_TOKEN_MAX_TTL_SECONDS, Math.floor(row.expiresAt.getTime() / 1000));
    const token = await sign({ sub: row.id, gen: row.generation, aud: ACCESS_TOKEN_AUDIENCE, exp }, config.jwtSecret, 'HS256');
    return { token, tokenExpiresAt: new Date(exp * 1000).toISOString(), ...profileOf(row) };
  }

  function profileOf(row: AccessCodeRow): AccessProfile {
    return { username: row.username, expiresAt: row.expiresAt.toISOString(), remainingMatches: remainingMatches(row) };
  }

  return {
    async list(): Promise<AccessCodeDto[]> {
      const now = clock();
      return (await repository.list()).map((row) => toDto(row, now));
    },

    /** 明文码只在这里返回一次 */
    async create(input: AccessCodeInput, adminId: number): Promise<AccessCodeSecret> {
      const now = clock();
      if (new Date(input.expiresAt).getTime() <= now) throw badRequest('有效期必须晚于当前时间');
      assertExpiryRange(input.expiresAt, now);
      const secret = generateCode();
      const normalized = normalizeCode(secret);
      const row = await repository.insert({
        ...values(input, input.disabled ?? false), codeHash: hashCode(normalized), codeHint: codeHint(normalized), createdBy: adminId,
      });
      return { accessCode: toDto(row, now), secret };
    },

    /** 编辑用户名、有效期、局数上限或停用状态；明文码不变 */
    async update(id: number, input: AccessCodeInput): Promise<AccessCodeDto> {
      const now = clock();
      assertExpiryRange(input.expiresAt, now);
      const current = await repository.find(id);
      if (!current) throw notFound('身份码');
      const row = await repository.update(id, values(input, input.disabled ?? current.disabled));
      if (!row) throw notFound('身份码');
      return toDto(row, now);
    },

    /** 换发新码：旧码与旧码换来的凭证立即失效 */
    async regenerate(id: number): Promise<AccessCodeSecret> {
      const secret = generateCode();
      const normalized = normalizeCode(secret);
      const row = await repository.rotate(id, hashCode(normalized), codeHint(normalized));
      if (!row) throw notFound('身份码');
      return { accessCode: toDto(row, clock()), secret };
    },

    async remove(id: number): Promise<void> {
      if (!(await repository.remove(id))) throw notFound('身份码');
    },

    /** C 端输入身份码换取凭证；输错按来源计数，超过次数暂时锁定 */
    async createSession(code: string, source: string): Promise<AccessSessionResponse> {
      const now = clock();
      if ((await failures.count(failureKey(source), new Date(now - FAILED_ACCESS_WINDOW_MS))) >= MAX_FAILED_ACCESS_PER_SOURCE) {
        throw tooManyRequests('身份码输错次数过多，请稍后再试');
      }
      const row = await repository.findByHash(hashCode(normalizeCode(code)));
      if (!row) {
        await failures.add(failureKey(source), new Date(now));
        throw unauthorized('身份码不正确');
      }
      const problem = unusable(row, null, now);
      if (problem) throw problem;
      return issue(row, now);
    },

    /** 校验凭证并读取身份码最新状态：停用、过期或重新生成后立即失效；局数用完仍可查看信息 */
    async authenticate(token: string): Promise<AccessGrant> {
      let payload: Record<string, unknown>;
      try {
        payload = await verify(token, config.jwtSecret, { alg: 'HS256', aud: ACCESS_TOKEN_AUDIENCE });
      } catch {
        throw unauthorized(EXPIRED_SESSION);
      }
      const { sub, gen } = payload;
      if (typeof sub !== 'number' || typeof gen !== 'number') throw unauthorized(EXPIRED_SESSION);
      const row = await repository.find(sub);
      const problem = unusable(row, gen, clock());
      if (problem && problem.status === 401) throw problem;
      return { codeId: sub, generation: gen, username: row!.username };
    },

    async profile(grant: AccessGrant): Promise<AccessProfile> {
      const row = await repository.find(grant.codeId);
      if (!row) throw unauthorized(EXPIRED_SESSION);
      return profileOf(row);
    },

    /** 开局事务内扣减一局；与插入对局同一事务，开局失败时计数一并回滚 */
    async consume(trx: Transaction<Database>, grant: AccessGrant): Promise<void> {
      const at = new Date(clock());
      if (await repository.consume(trx, grant.codeId, grant.generation, at)) return;
      throw unusable(await repository.find(grant.codeId, trx), grant.generation, at.getTime()) ?? forbidden(EXHAUSTED);
    },
  };
}

export type AccessCodeService = ReturnType<typeof createAccessCodeService>;
