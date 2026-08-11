import path from 'node:path';
import { runCutover } from '../commands/cutover';
import type { ReadinessReport } from '../reporting/reportTypes';
import type { ParsedCommand } from './arguments';

export function assertCutoverCliOptions(parsed: ParsedCommand): void {
  if (parsed.command !== 'cutover') return;
  if (parsed.values.has('target')) {
    throw Object.assign(new Error('Cutover target is fixed and must not be provided in argv'), {
      code: 'CUTOVER_TARGET_ARG_FORBIDDEN' as const,
    });
  }
  if (['schema', 'database', 'role', 'host', 'port'].some((name) => parsed.values.has(name))) {
    throw Object.assign(new Error('Production cutover identity is fixed and must not be provided in argv'), {
      code: 'CUTOVER_FIXED_OPTION_FORBIDDEN' as const,
    });
  }
  if (parsed.execute && !parsed.values.has('authorization')) {
    throw Object.assign(new Error('Approved pre-cutover authorization is required for execute'), {
      code: 'CUTOVER_AUTHORIZATION_REQUIRED' as const,
    });
  }
}

export async function runCutoverCli(parsed: ParsedCommand): Promise<ReadinessReport> {
  const sourceSnapshotPath = parsed.values.get('source-snapshot') || '';
  const sourceManifestPath = parsed.values.get('manifest') || '';
  const authorizationPath = parsed.values.get('authorization');
  const outputDirectory = parsed.values.get('output') || '';
  const runId = parsed.values.get('run-id') || '';
  const targetUrl = process.env.DATABASE_URL || '';
  const releaseCandidate = process.env.RELEASE_CANDIDATE_SHA || '';
  const tlsMode = process.env.DATABASE_SSL || '';
  const caPath = process.env.DATABASE_CA_PATH || '';
  if (!sourceSnapshotPath || !sourceManifestPath || !outputDirectory || !runId
    || (parsed.execute && (!authorizationPath || !targetUrl || !releaseCandidate || !tlsMode || !caPath))) {
    throw Object.assign(new Error(
      'Usage: set DATABASE_URL, RELEASE_CANDIDATE_SHA, DATABASE_SSL, and DATABASE_CA_PATH, then run cutover --source-snapshot <sqlite> --manifest <json> --authorization <json> --output <dir> --run-id <id> --execute',
    ), { code: 'CUTOVER_INVALID_PARAMETERS' as const });
  }
  return runCutover({
    runId,
    sourceSnapshotPath: path.resolve(sourceSnapshotPath),
    sourceManifestPath: path.resolve(sourceManifestPath),
    authorizationPath: authorizationPath ? path.resolve(authorizationPath) : undefined,
    outputDirectory: path.resolve(outputDirectory),
    execute: parsed.execute,
    targetUrl,
    releaseCandidate,
    tlsMode,
    caPath,
  });
}
