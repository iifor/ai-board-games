import { randomBytes } from 'node:crypto';
import { gameRegistry } from '@battle/games';
import { isApiSuccess, type ApiResponse } from '@battle/shared';
import { sql } from 'kysely';
import { createApp } from '../../src/app';
import type { AppConfig } from '../../src/config/env';
import { createServices, type ExternalDeps } from '../../src/container';
import { createDatabase } from '../../src/db/database';
import { migrateToLatest } from '../../src/db/migrate';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://battle@127.0.0.1:5433/battle';
export const ADMIN = { username: 'admin', password: 'initial-password-123' } as const;

/** 每个测试文件一个独立 schema，结束后删除 */
export async function createTestApp(overrides: Partial<AppConfig> = {}, external: ExternalDeps = {}) {
  const schema = `test_${randomBytes(6).toString('hex')}`;
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

  async function cleanup(): Promise<void> {
    await services.worker.stop();
    await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(db);
    await db.destroy();
  }

  return { app, injectWebSocket, db, services, config, call, adminToken, cleanup };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export function dataOf<T>(response: { body: ApiResponse<T> }): T {
  if (!isApiSuccess(response.body)) throw new Error(`期望成功，实际 ${response.body.code}：${response.body.message}`);
  return response.body.data;
}
