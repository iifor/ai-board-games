import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Client, type ClientConfig, type QueryResult } from 'pg';
import { captureStableFileContent } from '../backup/fileSnapshot';
import { CUTOVER_TARGET } from './types';
import type { MigrationClient } from '../types';

const LOCK_NAMESPACE = 'consensus:production-cutover:v1';

interface CutoverTargetClient {
  connect(): Promise<void>;
  query(sql: string, values?: readonly unknown[]): Promise<QueryResult<Record<string, unknown>>>;
  end(): Promise<void>;
}

export interface OpenCutoverTargetSessionOptions {
  targetUrl: string;
  tlsMode: string;
  caPath: string;
}

export interface CutoverTargetSession {
  client: CutoverTargetClient;
  release(): Promise<void>;
}

export interface CutoverTargetSessionDependencies {
  createClient(options: ClientConfig): CutoverTargetClient;
}

function targetError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function assertFixedUrl(targetUrl: string, tlsMode: string): void {
  try {
    const parsed = new URL(targetUrl);
    const port = parsed.port || '5432';
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    const role = decodeURIComponent(parsed.username);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || parsed.hostname !== CUTOVER_TARGET.host
      || port !== String(CUTOVER_TARGET.port)
      || database !== CUTOVER_TARGET.database
      || role !== CUTOVER_TARGET.role
      || tlsMode !== CUTOVER_TARGET.tlsMode
      || parsed.searchParams.get('sslmode') !== CUTOVER_TARGET.tlsMode) {
      throw new Error('unsafe');
    }
  } catch {
    throw targetError('CUTOVER_TARGET_UNSAFE', 'Production cutover target identity is unsafe');
  }
}

function gateIsSafe(row: Record<string, unknown> | undefined): boolean {
  return Boolean(row)
    && Math.floor(Number(row?.serverVersionNum) / 10_000) === 16
    && row?.database === CUTOVER_TARGET.database
    && row?.role === CUTOVER_TARGET.role
    && row?.superuser === false
    && row?.createdb === false
    && row?.createrole === false
    && row?.ssl === true
    && row?.schemaExists === false
    && Number(row?.userTableCount) === 0;
}

export async function readCutoverCa(caPath: string): Promise<string> {
  try {
    const resolved = path.resolve(caPath);
    const rootRealPath = await fs.realpath(path.dirname(resolved));
    const captured = await captureStableFileContent(
      resolved,
      rootRealPath,
      path.basename(resolved),
      'CUTOVER_TARGET_UNSAFE',
    );
    if (!captured.bytes.length) throw new Error('empty');
    return captured.bytes.toString('utf8');
  } catch {
    throw targetError('CUTOVER_TARGET_UNSAFE', 'Production cutover TLS configuration is unsafe');
  }
}

export async function createCutoverMigrationClient(
  options: OpenCutoverTargetSessionOptions,
): Promise<MigrationClient> {
  assertFixedUrl(options.targetUrl, options.tlsMode);
  const ca = await readCutoverCa(options.caPath);
  return new Client({
    connectionString: options.targetUrl,
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    application_name: 'consensus-production-cutover-import',
  }) as unknown as MigrationClient;
}

export async function validateCutoverEnvironment(
  options: OpenCutoverTargetSessionOptions,
): Promise<void> {
  assertFixedUrl(options.targetUrl, options.tlsMode);
  await readCutoverCa(options.caPath);
}

const defaultDependencies: CutoverTargetSessionDependencies = {
  createClient: (options) => new Client(options) as unknown as CutoverTargetClient,
};

export async function openCutoverTargetSession(
  options: OpenCutoverTargetSessionOptions,
  dependencies: Partial<CutoverTargetSessionDependencies> = {},
): Promise<CutoverTargetSession> {
  assertFixedUrl(options.targetUrl, options.tlsMode);
  const ca = await readCutoverCa(options.caPath);
  const resolved = { ...defaultDependencies, ...dependencies };
  const client = resolved.createClient({
    connectionString: options.targetUrl,
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    application_name: 'consensus-production-cutover',
  });
  let connected = false;
  let locked = false;
  try {
    await client.connect();
    connected = true;
    const lock = await client.query(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
      [LOCK_NAMESPACE],
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) throw targetError('CUTOVER_ALREADY_RUNNING', 'Another production cutover is already running');
    const gate = await client.query(`
      SELECT
        current_setting('server_version_num')::int AS "serverVersionNum",
        current_database() AS database,
        current_user AS role,
        current_role_state.rolsuper AS superuser,
        current_role_state.rolcreatedb AS createdb,
        current_role_state.rolcreaterole AS createrole,
        COALESCE(current_ssl.ssl, false) AS ssl,
        EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'consensus') AS "schemaExists",
        (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')) AS "userTableCount"
      FROM pg_roles current_role_state
      LEFT JOIN pg_stat_ssl current_ssl ON current_ssl.pid = pg_backend_pid()
      WHERE current_role_state.rolname = current_user
    `);
    if (!gateIsSafe(gate.rows[0])) {
      throw targetError('CUTOVER_TARGET_UNSAFE', 'Production cutover target safety gate failed');
    }
  } catch (error) {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK_NAMESPACE]).catch(() => undefined);
    if (connected) await client.end().catch(() => undefined);
    throw error;
  }

  let released = false;
  return {
    client,
    release: async () => {
      if (released) return;
      released = true;
      let closeFailed = false;
      try {
        const result = await client.query(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [LOCK_NAMESPACE],
        );
        if (result.rows[0]?.unlocked !== true) closeFailed = true;
      } catch {
        closeFailed = true;
      }
      try {
        await client.end();
      } catch {
        closeFailed = true;
      }
      if (closeFailed) {
        throw targetError('CUTOVER_SESSION_CLOSE_FAILED', 'Production cutover session failed to close');
      }
    },
  };
}

export type { CutoverTargetClient };
