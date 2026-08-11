import { createPostgresExecutor } from '../postgres';
import type { DbExecutor } from '../types';
import { migratePostgres } from './migrate';

interface CutoverAdapterRequest {
  targetUrl: string;
  schema: 'consensus';
  tlsMode: 'verify-full';
  ca: string;
}

interface CutoverAdapterResponse {
  ok: boolean;
  schema?: 'consensus';
  code?: string;
  message?: string;
}

interface CutoverAdapterDependencies {
  createExecutor(config: Parameters<typeof createPostgresExecutor>[0]): DbExecutor;
  migrate(database: DbExecutor): Promise<void>;
}

const INPUT_LIMIT_BYTES = 1024 * 1024;
const REQUEST_KEYS = ['targetUrl', 'schema', 'tlsMode', 'ca'];

function adapterError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function exactKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === REQUEST_KEYS.length
    && keys.every((key, index) => key === [...REQUEST_KEYS].sort()[index]);
}

function fixedTarget(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return ['postgres:', 'postgresql:'].includes(parsed.protocol)
      && parsed.hostname === 'postgres'
      && (parsed.port || '5432') === '5432'
      && decodeURIComponent(parsed.pathname.replace(/^\/+/, '')) === 'consensus'
      && decodeURIComponent(parsed.username) === 'consensus_migrator'
      && parsed.searchParams.get('sslmode') === 'verify-full';
  } catch {
    return false;
  }
}

function parseRequest(raw: string): CutoverAdapterRequest {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw) as unknown;
  } catch {
    throw adapterError('CUTOVER_ADAPTER_INPUT_INVALID', 'Cutover adapter input is invalid');
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
    || !exactKeys(candidate as Record<string, unknown>)) {
    throw adapterError('CUTOVER_ADAPTER_INPUT_INVALID', 'Cutover adapter input is invalid');
  }
  const request = candidate as Partial<CutoverAdapterRequest>;
  if (request.schema !== 'consensus' || request.tlsMode !== 'verify-full'
    || typeof request.ca !== 'string' || !request.ca
    || typeof request.targetUrl !== 'string' || !fixedTarget(request.targetUrl)) {
    throw adapterError('CUTOVER_ADAPTER_INPUT_INVALID', 'Cutover adapter input is invalid');
  }
  return request as CutoverAdapterRequest;
}

function safeGate(row: Record<string, unknown> | null): boolean {
  return Boolean(row)
    && Math.floor(Number(row?.serverVersionNum) / 10_000) === 16
    && row?.database === 'consensus'
    && row?.role === 'consensus_migrator'
    && row?.ssl === true
    && row?.schemaExists === false;
}

const defaultDependencies: CutoverAdapterDependencies = {
  createExecutor: createPostgresExecutor,
  migrate: migratePostgres,
};

async function executeRequest(
  request: CutoverAdapterRequest,
  dependencies: Partial<CutoverAdapterDependencies> = {},
): Promise<CutoverAdapterResponse> {
  const validated = parseRequest(JSON.stringify(request));
  const resolved = { ...defaultDependencies, ...dependencies };
  const database = resolved.createExecutor({
    connectionString: validated.targetUrl,
    schema: 'consensus',
    poolMax: 1,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    ssl: { ca: validated.ca, rejectUnauthorized: true },
  });
  let primaryError: unknown;
  try {
    const gate = await database.queryOne<Record<string, unknown>>(`
      SELECT current_setting('server_version_num')::int AS "serverVersionNum",
        current_database() AS database, current_user AS role,
        COALESCE(current_ssl.ssl, false) AS ssl,
        EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'consensus') AS "schemaExists"
      FROM pg_stat_ssl current_ssl WHERE current_ssl.pid = pg_backend_pid()
    `);
    if (!safeGate(gate)) throw adapterError('CUTOVER_TARGET_UNSAFE', 'Production cutover target safety gate failed');
    try {
      await database.execute('CREATE SCHEMA "consensus"');
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === '42P06') {
        throw adapterError('CUTOVER_TARGET_UNSAFE', 'Production cutover schema already exists');
      }
      throw error;
    }
    await resolved.migrate(database);
  } catch (error) {
    primaryError = error;
  }
  try {
    await database.close();
  } catch {
    if (!primaryError) primaryError = adapterError('CUTOVER_ADAPTER_CLOSE_FAILED', 'Cutover adapter failed to close');
  }
  if (primaryError) throw primaryError;
  return { ok: true, schema: 'consensus' };
}

function publicFailure(error: unknown): CutoverAdapterResponse {
  const code = (error as { code?: unknown } | null)?.code;
  if (['CUTOVER_ADAPTER_INPUT_INVALID', 'CUTOVER_TARGET_UNSAFE', 'CUTOVER_ADAPTER_CLOSE_FAILED'].includes(String(code))) {
    return { ok: false, code: String(code), message: (error as Error).message };
  }
  return { ok: false, code: 'CUTOVER_ADAPTER_FAILED', message: 'Production cutover adapter failed' };
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > INPUT_LIMIT_BYTES) throw adapterError('CUTOVER_ADAPTER_INPUT_INVALID', 'Cutover adapter input is invalid');
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  try {
    process.stdout.write(`${JSON.stringify(await executeRequest(parseRequest(await readStandardInput())))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(publicFailure(error))}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

export { executeRequest, parseRequest };
export type { CutoverAdapterDependencies, CutoverAdapterRequest, CutoverAdapterResponse };
