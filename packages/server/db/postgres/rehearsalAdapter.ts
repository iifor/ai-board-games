import { createPostgresExecutor } from '../postgres';
import { migratePostgres } from './migrate';
import type { DbExecutor } from '../types';

type RehearsalAdapterOperation = 'exists' | 'run-exists' | 'create-and-migrate';

interface RehearsalAdapterRequest {
  operation: RehearsalAdapterOperation;
  targetUrl: string;
  schema: string;
}

interface RehearsalAdapterResponse {
  ok: boolean;
  operation?: RehearsalAdapterOperation;
  schema?: string;
  exists?: boolean;
  code?: string;
  message?: string;
}

interface RehearsalAdapterDependencies {
  createExecutor(config: Parameters<typeof createPostgresExecutor>[0]): DbExecutor;
  migrate(database: DbExecutor): Promise<void>;
}

const REHEARSAL_SCHEMA = /^consensus_rehearsal_\d{8}t\d{9}z_([a-f0-9]{10})$/;
const INPUT_LIMIT_BYTES = 1024 * 1024;

function adapterError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function databaseIsSafe(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return ['postgres:', 'postgresql:'].includes(parsed.protocol)
      && /(?:_test|_rehearsal)$/.test(database);
  } catch {
    return false;
  }
}

function parseRequest(raw: string): RehearsalAdapterRequest {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw adapterError('REHEARSAL_ADAPTER_INPUT_INVALID', 'Rehearsal adapter input is invalid');
  }
  const request = candidate as Partial<RehearsalAdapterRequest> | null;
  if (!request
    || !['exists', 'run-exists', 'create-and-migrate'].includes(request.operation || '')
    || typeof request.targetUrl !== 'string'
    || typeof request.schema !== 'string'
    || !REHEARSAL_SCHEMA.test(request.schema)) {
    throw adapterError('REHEARSAL_ADAPTER_INPUT_INVALID', 'Rehearsal adapter input is invalid');
  }
  if (!databaseIsSafe(request.targetUrl)) {
    throw adapterError(
      'REHEARSAL_DATABASE_UNSAFE',
      'Migration rehearsal requires a dedicated test database',
    );
  }
  return request as RehearsalAdapterRequest;
}

function tlsConfiguration(targetUrl: string): false | { rejectUnauthorized: true } {
  return new URL(targetUrl).searchParams.get('sslmode')?.toLowerCase() === 'verify-full'
    ? { rejectUnauthorized: true }
    : false;
}

const defaultDependencies: RehearsalAdapterDependencies = {
  createExecutor: createPostgresExecutor,
  migrate: migratePostgres,
};

async function executeRequest(
  request: RehearsalAdapterRequest,
  dependencies: Partial<RehearsalAdapterDependencies> = {},
): Promise<RehearsalAdapterResponse> {
  const resolved = { ...defaultDependencies, ...dependencies };
  const database = resolved.createExecutor({
    connectionString: request.targetUrl,
    schema: request.schema,
    poolMax: 1,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    ssl: tlsConfiguration(request.targetUrl),
  });
  let response: RehearsalAdapterResponse | undefined;
  let primaryError: unknown;
  try {
    const runHash = REHEARSAL_SCHEMA.exec(request.schema)![1];
    const runExists = async (): Promise<boolean> => {
      const result = await database.queryOne<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.schemata
          WHERE schema_name ~ '^consensus_rehearsal_[0-9]{8}t[0-9]{9}z_[a-f0-9]{10}$'
            AND RIGHT(schema_name, 11) = $1
        ) AS exists`,
        [`_${runHash}`],
      );
      return result?.exists === true;
    };
    if (request.operation === 'exists') {
      const existing = await database.queryOne<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS exists',
        [request.schema],
      );
      const exists = existing?.exists === true;
      response = { ok: true, operation: request.operation, schema: request.schema, exists };
    } else if (request.operation === 'run-exists') {
      response = { ok: true, operation: request.operation, schema: request.schema, exists: await runExists() };
    } else {
      const lockKey = `consensus_rehearsal_run:${runHash}`;
      await database.queryOne('SELECT pg_advisory_lock(hashtext($1))', [lockKey]);
      let operationError: unknown;
      try {
        if (await runExists()) {
          throw adapterError('REHEARSAL_TARGET_EXISTS', 'Rehearsal target schema already exists');
        }
        try {
          await database.execute(`CREATE SCHEMA "${request.schema}"`);
        } catch (error) {
          if ((error as { code?: string } | null)?.code === '42P06') {
            throw adapterError('REHEARSAL_TARGET_EXISTS', 'Rehearsal target schema already exists');
          }
          throw error;
        }
        await resolved.migrate(database);
      } catch (error) {
        operationError = error;
      }
      try {
        await database.queryOne('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
      } catch (error) {
        if (!operationError) operationError = error;
      }
      if (operationError) throw operationError;
      response = { ok: true, operation: request.operation, schema: request.schema, exists: true };
    }
  } catch (error) {
    primaryError = error;
  }
  try {
    await database.close();
  } catch {
    if (!primaryError) {
      primaryError = adapterError('REHEARSAL_ADAPTER_CLOSE_FAILED', 'PostgreSQL rehearsal adapter failed to close');
    }
  }
  if (primaryError) throw primaryError;
  return response!;
}

function publicFailure(error: unknown): RehearsalAdapterResponse {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'REHEARSAL_TARGET_EXISTS' || code === 'REHEARSAL_DATABASE_UNSAFE'
    || code === 'REHEARSAL_ADAPTER_CLOSE_FAILED'
    || code === 'REHEARSAL_ADAPTER_INPUT_INVALID') {
    return { ok: false, code: String(code), message: (error as Error).message };
  }
  return { ok: false, code: 'REHEARSAL_ADAPTER_FAILED', message: 'PostgreSQL rehearsal adapter failed' };
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > INPUT_LIMIT_BYTES) {
      throw adapterError('REHEARSAL_ADAPTER_INPUT_INVALID', 'Rehearsal adapter input is invalid');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  try {
    const request = parseRequest(await readStandardInput());
    process.stdout.write(`${JSON.stringify(await executeRequest(request))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(publicFailure(error))}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

export { executeRequest, parseRequest };
export type { RehearsalAdapterDependencies, RehearsalAdapterRequest, RehearsalAdapterResponse };
