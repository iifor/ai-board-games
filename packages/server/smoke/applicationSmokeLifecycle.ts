import crypto from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import { createApp } from '../app';
import { setDbExecutorForTests } from '../db';
import type { DatabaseConfig } from '../db/config';
import { createPostgresExecutor } from '../db/postgres';
import type { DbExecutor } from '../db/types';
import { shutdownObservability } from '../modules/observability';
import type { ApplicationSmokeAdapterRequest, SmokeRuntime } from './applicationSmokeTypes';

interface EnvironmentSnapshot {
  ADMIN_PASSWORD?: string;
  ADMIN_USERNAME?: string;
  DATABASE_SCHEMA?: string;
  DATABASE_URL?: string;
  JWT_SECRET?: string;
}

interface ApplicationSmokeLifecycleDependencies {
  createApplication: typeof createApp;
}

const defaultDependencies: ApplicationSmokeLifecycleDependencies = {
  createApplication: createApp,
};

function restoreEnvironment(snapshot: EnvironmentSnapshot): void {
  for (const key of Object.keys(snapshot) as Array<keyof EnvironmentSnapshot>) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function createHealthAwareExecutor(database: DbExecutor, healthProbe: DbExecutor): DbExecutor {
  return {
    queryOne: <T extends object>(sql: string, params?: readonly unknown[]) => database.queryOne<T>(sql, params),
    queryMany: <T extends object>(sql: string, params?: readonly unknown[]) => database.queryMany<T>(sql, params),
    execute: (sql, params) => database.execute(sql, params),
    withTransaction: (operation, options) => database.withTransaction(operation, options),
    healthCheck: () => healthProbe.healthCheck(),
    close: () => database.close(),
  };
}

async function closeHttpServer(server: http.Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function startApplicationSmokeRuntime(
  request: ApplicationSmokeAdapterRequest,
  dependencies: ApplicationSmokeLifecycleDependencies = defaultDependencies,
): Promise<SmokeRuntime> {
  const config: DatabaseConfig = {
    connectionString: request.targetUrl,
    schema: request.targetSchema,
    poolMax: 4,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    ssl: new URL(request.targetUrl).searchParams.get('sslmode')?.toLowerCase() === 'verify-full'
      ? { rejectUnauthorized: true as const }
      : false,
  };
  const database = createPostgresExecutor(config);
  const healthProbe = createPostgresExecutor({ ...config, poolMax: 1 });
  const executor = createHealthAwareExecutor(database, healthProbe);
  const suffix = crypto.createHash('sha256').update(request.runId).digest('hex').slice(0, 10);
  const adminUsername = `application-smoke-${suffix}`;
  const adminPassword = 'application-smoke-initial-password';
  const environment: EnvironmentSnapshot = {
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    DATABASE_SCHEMA: process.env.DATABASE_SCHEMA,
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
  };
  process.env.ADMIN_USERNAME = adminUsername;
  process.env.ADMIN_PASSWORD = adminPassword;
  process.env.DATABASE_SCHEMA = request.targetSchema;
  process.env.DATABASE_URL = request.targetUrl;
  process.env.JWT_SECRET = 'application-smoke-jwt-secret-at-least-32-characters';
  setDbExecutorForTests(executor);
  let server: http.Server | undefined;
  let probeClosed = false;
  let closed = false;
  try {
    server = http.createServer(await dependencies.createApplication());
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Application smoke server did not bind');
    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      database,
      adminUsername,
      adminPassword,
      async disconnectHealthProbe() {
        if (probeClosed) return;
        probeClosed = true;
        await healthProbe.close();
      },
      async close() {
        if (closed) return;
        closed = true;
        let primaryError: unknown;
        try { await closeHttpServer(server!); } catch (error) { primaryError = error; }
        try { await shutdownObservability(); } catch (error) { if (!primaryError) primaryError = error; }
        setDbExecutorForTests(null);
        if (!probeClosed) {
          try { await healthProbe.close(); } catch (error) { if (!primaryError) primaryError = error; }
          probeClosed = true;
        }
        try { await database.close(); } catch (error) { if (!primaryError) primaryError = error; }
        restoreEnvironment(environment);
        if (primaryError) throw primaryError;
      },
    };
  } catch (error) {
    if (server) await closeHttpServer(server).catch(() => undefined);
    await shutdownObservability().catch(() => undefined);
    setDbExecutorForTests(null);
    if (!probeClosed) await healthProbe.close().catch(() => undefined);
    await database.close().catch(() => undefined);
    restoreEnvironment(environment);
    throw error;
  }
}

export { startApplicationSmokeRuntime };
export type { ApplicationSmokeLifecycleDependencies };
