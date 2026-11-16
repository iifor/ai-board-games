import { randomBytes } from 'node:crypto';
import { gameRegistry } from '@battle/games';
import { isApiSuccess, type AccessCodeInput, type ApiResponse } from '@battle/shared';
import { sql } from 'kysely';
import { createApp } from '../../src/app';
import type { AppConfig } from '../../src/config/env';
import type { AccessGrant } from '../../src/types';
import { createServices, type ExternalDeps } from '../../src/container';
import { createDatabase } from '../../src/db/database';
import { migrateToLatest } from '../../src/db/migrate';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://battle@127.0.0.1:5433/battle';
export const ADMIN = { username: 'admin', password: 'initial-password-123' } as const;

export interface TestAppOptions {
  /** 复用另一个实例的 schema（多实例测试）：schema 由创建它的实例负责删除 */
  readonly schema?: string;
}

/** 每个测试文件一个独立 schema，结束后删除；每个实例有自己的连接池、实例 ID 与跨实例通知的监听连接 */
export async function createTestApp(overrides: Partial<AppConfig> = {}, external: ExternalDeps = {}, options: TestAppOptions = {}) {
  const schema = options.schema ?? `test_${randomBytes(6).toString('hex')}`;
  const config: AppConfig = {
    env: 'test',
    port: 0,
    database: { url: TEST_DATABASE_URL, schema, poolMax: 3 },
    jwtSecret: randomBytes(32).toString('hex'),
    secretKey: randomBytes(32),
    bootstrapAdmin: ADMIN,
    tts: { azure: null, mimo: null },
    ai: { concurrency: 4, maxAttempts: 3 },
    matches: { maxActive: 5, idleMs: 30 * 60_000 },
    realtime: { pollMs: 2000 },
    http: { trustProxy: false },
    shutdown: { timeoutMs: 10_000 },
    ...overrides,
  };
  const db = createDatabase(config.database);
  await migrateToLatest(db, schema);
  const services = createServices(db, config, gameRegistry, { sleep: async () => {}, ...external });
  await services.auth.bootstrap();
  await services.bus.start();
  const { app, injectWebSocket } = createApp(services, { trustProxy: config.http.trustProxy });

  async function call<T>(method: string, path: string, options: { body?: unknown; token?: string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...options.headers };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    const response = await app.request(path, init);
    return { status: response.status, body: (await response.json()) as ApiResponse<T> };
  }

  /** 登录并完成首次改密，返回可直接访问后台接口的令牌 */
  async function adminToken(): Promise<string> {
    const { token } = dataOf(await call<{ token: string }>('POST', '/api/admin/auth/login', { body: ADMIN }));
    await call('POST', '/api/admin/auth/password', { token, body: { currentPassword: ADMIN.password, newPassword: 'changed-password-456' } });
    const relogin = await call<{ token: string }>('POST', '/api/admin/auth/login', { body: { username: ADMIN.username, password: 'changed-password-456' } });
    return dataOf(relogin).token;
  }

  /**
   * 建一个身份码并换取 C 端开局凭证：token 用于 HTTP 接口，grant 用于直接调用 service。
   * 不传参数时同一实例复用一个默认身份码（不限局数、一天后过期）。
   */
  let defaultAccess: Promise<TestAccess> | null = null;
  function access(input?: Partial<AccessCodeInput>): Promise<TestAccess> {
    if (!input) return (defaultAccess ??= issueAccess({}));
    return issueAccess(input);
  }
  async function issueAccess(input: Partial<AccessCodeInput>): Promise<TestAccess> {
    const admin = await db.selectFrom('adminUsers').select('id').orderBy('id').executeTakeFirstOrThrow();
    const created = await services.accessCodes.create({
      username: '测试用户', expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), maxMatches: null, ...input,
    }, admin.id);
    const { token } = await services.accessCodes.createSession(created.secret, 'test');
    return { id: created.accessCode.id, secret: created.secret, token, grant: await services.accessCodes.authenticate(token) };
  }

  async function cleanup(): Promise<void> {
    await services.worker.stop();
    await services.bus.stop();
    if (!options.schema) await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(db);
    await db.destroy();
  }

  return { app, injectWebSocket, db, services, config, schema, call, adminToken, access, cleanup };
}

export interface TestAccess {
  readonly id: number;
  readonly secret: string;
  readonly token: string;
  readonly grant: AccessGrant;
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export function dataOf<T>(response: { body: ApiResponse<T> }): T {
  if (!isApiSuccess(response.body)) throw new Error(`期望成功，实际 ${response.body.code}：${response.body.message}`);
  return response.body.data;
}
