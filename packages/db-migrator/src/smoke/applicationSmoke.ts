import { spawn } from 'node:child_process';
import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import { writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessReport } from '../reporting/reportTypes';

interface ApplicationSmokeOptions {
  runId: string;
  targetUrl: string;
  targetSchema: string;
  outputDirectory: string;
  productionCutover?: boolean;
}

interface AdapterCheck {
  id: string;
  status: 'passed' | 'failed';
  expected?: string;
  actual?: string;
  message: string;
}

interface AdapterResponse {
  ok: boolean;
  schema?: string;
  checks: AdapterCheck[];
  errors: Array<{ code: string; message: string }>;
}

interface ApplicationSmokeDependencies {
  adapterPath: string;
  now(): Date;
  writeReport: typeof writeReadinessReport;
}

const defaultDependencies: ApplicationSmokeDependencies = {
  adapterPath: path.resolve(__dirname, '../../../server/dist/ops/server/smoke/applicationSmokeAdapter.js'),
  now: () => new Date(),
  writeReport: writeReadinessReport,
};

function validResponse(value: unknown): value is AdapterResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<AdapterResponse>;
  return typeof response.ok === 'boolean'
    && Array.isArray(response.checks)
    && Array.isArray(response.errors);
}

async function invokeAdapter(adapterPath: string, options: ApplicationSmokeOptions): Promise<AdapterResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [adapterPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const chunks: Buffer[] = [];
    let size = 0;
    let outputExceeded = false;
    child.stdout.on('data', (chunk: Buffer | string) => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += value.length;
      if (size > 1024 * 1024) {
        outputExceeded = true;
        child.kill();
      } else chunks.push(value);
    });
    child.stderr.resume();
    child.once('error', reject);
    child.once('close', () => {
      if (outputExceeded) return reject(new Error('Smoke adapter output exceeded limit'));
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!validResponse(value)) throw new Error('Invalid smoke adapter response');
        resolve(value);
      } catch {
        reject(new Error('Smoke adapter response could not be parsed'));
      }
    });
    child.stdin.end(JSON.stringify({
      runId: options.runId,
      targetUrl: options.targetUrl,
      targetSchema: options.targetSchema,
      ...(options.productionCutover ? { purpose: 'production-cutover' } : {}),
    }));
  });
}

function buildReport(
  options: ApplicationSmokeOptions,
  startedAt: Date,
  finishedAt: Date,
  response: AdapterResponse,
): ReadinessReport {
  return {
    runId: options.runId,
    schema: options.targetSchema,
    stage: 'smoke',
    status: response.ok ? 'passed' : 'failed',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    checks: response.checks,
    artifacts: [],
    errors: response.errors,
  };
}

async function runApplicationSmoke(
  options: ApplicationSmokeOptions,
  dependencies: Partial<ApplicationSmokeDependencies> = {},
): Promise<ReadinessReport> {
  const resolved = { ...defaultDependencies, ...dependencies };
  const startedAt = resolved.now();
  let response: AdapterResponse;
  if (!isSafeRunId(options.runId) || !/^[a-z][a-z0-9_]{0,62}$/.test(options.targetSchema)) {
    response = {
      ok: false,
      checks: [{ id: 'parameters.safe', status: 'failed', message: 'Smoke parameters are invalid' }],
      errors: [{ code: 'APPLICATION_SMOKE_INVALID_PARAMETERS', message: 'Application smoke parameters are invalid' }],
    };
  } else {
    try {
      response = await invokeAdapter(resolved.adapterPath, options);
    } catch {
      response = {
        ok: false,
        checks: [{ id: 'adapter.completed', status: 'failed', message: 'Compiled application smoke adapter failed' }],
        errors: [{ code: 'APPLICATION_SMOKE_ADAPTER_FAILED', message: 'Compiled application smoke adapter failed' }],
      };
    }
  }
  const report = buildReport(options, startedAt, resolved.now(), response);
  await resolved.writeReport({ outputDirectory: options.outputDirectory, report });
  return report;
}

export { runApplicationSmoke };
export type { ApplicationSmokeDependencies, ApplicationSmokeOptions };
