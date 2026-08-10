import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { isSafeRunId } from '../backup/publication';

const REHEARSAL_SCHEMA = /^consensus_rehearsal_\d{8}t\d{9}z_[a-f0-9]{10}$/;

function rehearsalError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export function buildRehearsalSchema(runId: string, now: Date): string {
  if (!isSafeRunId(runId)) {
    throw rehearsalError('INVALID_RUN_ID', 'runId must be a safe, non-empty identifier');
  }
  if (Number.isNaN(now.getTime())) {
    throw rehearsalError('INVALID_REHEARSAL_TIME', 'Rehearsal time must be valid');
  }
  const timestamp = now.toISOString().replace(/[-:.]/g, '').toLowerCase();
  const runHash = createHash('sha256').update(runId).digest('hex').slice(0, 10);
  return `consensus_rehearsal_${timestamp}_${runHash}`;
}

export function assertRehearsalDatabase(targetUrl: string): void {
  try {
    const parsed = new URL(targetUrl);
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || !database
      || !/(?:_test|_rehearsal)$/.test(database)) {
      throw new Error('unsafe');
    }
  } catch {
    throw rehearsalError(
      'REHEARSAL_DATABASE_UNSAFE',
      'Migration rehearsal requires a PostgreSQL database ending in _test or _rehearsal',
    );
  }
}

export function assertRehearsalSchema(schema: string): void {
  if (!REHEARSAL_SCHEMA.test(schema)) {
    throw rehearsalError('REHEARSAL_SCHEMA_UNSAFE', 'Rehearsal schema name is unsafe');
  }
}

export interface AdapterResponse {
  ok: boolean;
  schema?: string;
  exists?: boolean;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export interface RehearsalAdapterClientDependencies {
  adapterFilePath: string;
}

function adapterPath(): string {
  return path.resolve(__dirname, '../../../server/dist/db/postgres/rehearsalAdapter.js');
}

export async function runRehearsalAdapter(
  operation: 'exists' | 'run-exists' | 'create-and-migrate',
  targetUrl: string,
  schema: string,
  dependencies: Partial<RehearsalAdapterClientDependencies> = {},
): Promise<AdapterResponse> {
  assertRehearsalDatabase(targetUrl);
  assertRehearsalSchema(schema);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [dependencies.adapterFilePath || adapterPath()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let outputExceeded = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length + chunk.length > 1024 * 1024) {
        outputExceeded = true;
        child.kill();
        return;
      }
      stdout += chunk;
    });
    child.stderr.resume();
    child.on('error', () => reject(rehearsalError(
      'REHEARSAL_ADAPTER_UNAVAILABLE',
      'Compiled PostgreSQL rehearsal adapter is unavailable',
    )));
    child.on('close', () => {
      if (outputExceeded) {
        reject(rehearsalError('REHEARSAL_ADAPTER_FAILED', 'PostgreSQL rehearsal adapter failed'));
        return;
      }
      let response: AdapterResponse;
      try {
        response = JSON.parse(stdout.trim()) as AdapterResponse;
      } catch {
        reject(rehearsalError('REHEARSAL_ADAPTER_FAILED', 'PostgreSQL rehearsal adapter failed'));
        return;
      }
      if (!response.ok) {
        reject(rehearsalError(
          response.code || 'REHEARSAL_ADAPTER_FAILED',
          response.message || 'PostgreSQL rehearsal adapter failed',
        ));
        return;
      }
      resolve(response);
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify({ operation, targetUrl, schema }));
  });
}

export async function rehearsalSchemaExists(targetUrl: string, schema: string): Promise<boolean> {
  return (await runRehearsalAdapter('exists', targetUrl, schema)).exists === true;
}

export async function rehearsalRunExists(targetUrl: string, schema: string): Promise<boolean> {
  return (await runRehearsalAdapter('run-exists', targetUrl, schema)).exists === true;
}

export async function createRehearsalSchema(targetUrl: string, schema: string): Promise<void> {
  await runRehearsalAdapter('create-and-migrate', targetUrl, schema);
}
