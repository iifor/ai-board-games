import type { ApplicationSmokeAdapterRequest, ApplicationSmokeAdapterResponse } from './applicationSmokeTypes';
import { runApplicationSmokeScenario } from './applicationSmokeScenario';

const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > 1024 * 1024) throw new Error('Smoke adapter request exceeded limit');
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseRequest(raw: string): ApplicationSmokeAdapterRequest {
  const value = JSON.parse(raw) as Partial<ApplicationSmokeAdapterRequest>;
  if (!RUN_ID.test(value.runId || '')) throw new Error('Invalid smoke runId');
  if (!IDENTIFIER.test(value.targetSchema || '')) throw new Error('Invalid smoke schema');
  const targetUrl = new URL(value.targetUrl || '');
  if (!['postgres:', 'postgresql:'].includes(targetUrl.protocol)) throw new Error('Invalid smoke database URL');
  const database = targetUrl.pathname.replace(/^\//, '').toLowerCase();
  if (!/(?:_test|_rehearsal)$/.test(database)) throw new Error('Smoke database must be dedicated to testing');
  return value as ApplicationSmokeAdapterRequest;
}

async function executeRequest(request: ApplicationSmokeAdapterRequest): Promise<ApplicationSmokeAdapterResponse> {
  const observabilityErrors: string[] = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  console.log = () => undefined;
  console.info = () => undefined;
  console.warn = () => undefined;
  console.error = (...args: unknown[]) => {
    const line = args.map(String).join(' ');
    if (line.startsWith('[observability]')) observabilityErrors.push(line);
  };
  try {
    return await runApplicationSmokeScenario(request, observabilityErrors);
  } finally {
    Object.assign(console, original);
  }
}

async function main(): Promise<void> {
  let response: ApplicationSmokeAdapterResponse;
  try {
    response = await executeRequest(parseRequest(await readStdin()));
  } catch {
    response = {
      ok: false,
      checks: [],
      errors: [{ code: 'APPLICATION_SMOKE_ADAPTER_FAILED', message: 'Application smoke adapter failed' }],
    };
  }
  process.stdout.write(`${JSON.stringify(response)}\n`);
  if (!response.ok) process.exitCode = 1;
}

if (require.main === module) void main();

export { executeRequest, parseRequest };
