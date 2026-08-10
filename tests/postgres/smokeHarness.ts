import { once } from 'node:events';
import http from 'node:http';
import { Pool } from 'pg';
import { createApp } from '../../packages/server/app';
import { setDbExecutorForTests } from '../../packages/server/db';
import { createPostgresExecutor } from '../../packages/server/db/postgres';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import { shutdownObservability } from '../../packages/server/modules/observability';
import type { DbExecutor } from '../../packages/server/db/types';
import { readTestDatabaseUrl } from './helpers';

interface SmokeSchema {
  targetUrl: string;
  database: DbExecutor;
  schema: string;
  close(): Promise<void>;
}

interface SmokeApplication extends SmokeSchema {
  baseUrl: string;
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function smokeSchemaName(): string {
  return `consensus_smoke_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function createSmokeSchema(): Promise<SmokeSchema> {
  const targetUrl = readTestDatabaseUrl();
  const schema = smokeSchemaName();
  const admin = new Pool({ connectionString: targetUrl });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const database = createPostgresExecutor({
    connectionString: targetUrl,
    schema,
    poolMax: 4,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    ssl: false,
  });
  await migratePostgres(database);
  let closed = false;
  return {
    targetUrl,
    database,
    schema,
    async close() {
      if (closed) return;
      closed = true;
      await database.close();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    },
  };
}

async function startSmokeApplication(): Promise<SmokeApplication> {
  const schema = await createSmokeSchema();
  setDbExecutorForTests(schema.database);
  const previous = {
    adminPassword: process.env.ADMIN_PASSWORD,
    adminUsername: process.env.ADMIN_USERNAME,
    databaseSchema: process.env.DATABASE_SCHEMA,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
  };
  process.env.ADMIN_USERNAME = 'application-smoke-admin';
  process.env.ADMIN_PASSWORD = 'application-smoke-initial-password';
  process.env.DATABASE_SCHEMA = schema.schema;
  process.env.DATABASE_URL = schema.targetUrl;
  process.env.JWT_SECRET = 'application-smoke-jwt-secret-at-least-32-characters';
  let server: http.Server | undefined;
  try {
    server = http.createServer(await createApp());
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Smoke HTTP server did not bind');
    let closed = false;
    return {
      ...schema,
      baseUrl: `http://127.0.0.1:${address.port}`,
      async close() {
        if (closed) return;
        closed = true;
        await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
        await shutdownObservability();
        setDbExecutorForTests(null);
        await schema.close();
        restoreEnvironment('ADMIN_USERNAME', previous.adminUsername);
        restoreEnvironment('ADMIN_PASSWORD', previous.adminPassword);
        restoreEnvironment('DATABASE_SCHEMA', previous.databaseSchema);
        restoreEnvironment('DATABASE_URL', previous.databaseUrl);
        restoreEnvironment('JWT_SECRET', previous.jwtSecret);
      },
    };
  } catch (error) {
    if (server?.listening) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await shutdownObservability();
    setDbExecutorForTests(null);
    await schema.close();
    restoreEnvironment('ADMIN_USERNAME', previous.adminUsername);
    restoreEnvironment('ADMIN_PASSWORD', previous.adminPassword);
    restoreEnvironment('DATABASE_SCHEMA', previous.databaseSchema);
    restoreEnvironment('DATABASE_URL', previous.databaseUrl);
    restoreEnvironment('JWT_SECRET', previous.jwtSecret);
    throw error;
  }
}

export { createSmokeSchema, startSmokeApplication };
export type { SmokeApplication, SmokeSchema };
