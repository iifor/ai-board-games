import { spawn } from 'node:child_process';
import path from 'node:path';
import { readCutoverCa } from '../cutover/targetSession';

interface CutoverSchemaAdapterResponse {
  ok: boolean;
  schema?: 'consensus';
  code?: string;
  message?: string;
}

export interface CutoverSchemaAdapterOptions {
  targetUrl: string;
  tlsMode: string;
  caPath: string;
}

export interface CutoverSchemaAdapterDependencies {
  adapterPath: string;
}

function adapterError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function defaultAdapterPath(): string {
  return path.resolve(__dirname, '../../../server/dist/ops/server/db/postgres/cutoverAdapter.js');
}

export async function runCutoverSchemaAdapter(
  options: CutoverSchemaAdapterOptions,
  dependencies: Partial<CutoverSchemaAdapterDependencies> = {},
): Promise<void> {
  const ca = await readCutoverCa(options.caPath);
  const response = await new Promise<CutoverSchemaAdapterResponse>((resolve, reject) => {
    const child = spawn(process.execPath, [dependencies.adapterPath || defaultAdapterPath()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let exceeded = false;
    child.stdout.on('data', (chunk: Buffer | string) => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += value.length;
      if (size > 1024 * 1024) {
        exceeded = true;
        child.kill();
      } else chunks.push(value);
    });
    child.stderr.resume();
    child.once('error', () => reject(adapterError('CUTOVER_ADAPTER_UNAVAILABLE', 'Compiled cutover adapter is unavailable')));
    child.once('close', () => {
      if (exceeded) return reject(adapterError('CUTOVER_ADAPTER_FAILED', 'Production cutover adapter failed'));
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as CutoverSchemaAdapterResponse;
        if (!parsed || typeof parsed.ok !== 'boolean') throw new Error('invalid');
        resolve(parsed);
      } catch {
        reject(adapterError('CUTOVER_ADAPTER_FAILED', 'Production cutover adapter failed'));
      }
    });
    child.stdin.end(JSON.stringify({
      targetUrl: options.targetUrl,
      schema: 'consensus',
      tlsMode: options.tlsMode,
      ca,
    }));
  });
  if (!response.ok) {
    throw adapterError(response.code || 'CUTOVER_ADAPTER_FAILED', response.message || 'Production cutover adapter failed');
  }
  if (response.schema !== 'consensus') {
    throw adapterError('CUTOVER_ADAPTER_FAILED', 'Production cutover adapter returned an invalid schema');
  }
}
