import path from 'node:path';
import { migrateSqliteToPostgres } from './importer';
import { runBackup } from './commands/backup';
import { runPreflight } from './commands/preflight';
import { runRehearsal } from './commands/rehearse';
import { runValidation } from './commands/validate';
import { runReleaseReadiness } from './commands/release-readiness';
import { runVerifyBackup } from './commands/verify-backup';
import { runRestoreDrill } from './commands/restore-drill';
import { runPrepareSignoff } from './commands/prepare-signoff';
import { parseCommandLine, type ParsedCommand } from './cli/arguments';
import { assertCutoverCliOptions, runCutoverCli } from './cli/cutoverDispatch';
import { isDeploymentGateCommand, runDeploymentGateCommand } from './cli/deploymentGateDispatch';
import { readinessReportExitCode, redactSecrets, sanitizeForOutput } from './reporting/reportWriter';
import type { ReadinessReport } from './reporting/reportTypes';
import type { MigrationReport } from './types';

export interface CliDependencies {
  migrate: typeof migrateSqliteToPostgres;
  runReadinessCommand?: (command: Exclude<ParsedCommand['command'], 'migrate'>, parsed: ParsedCommand) => Promise<ReadinessReport>;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  setExitCode: (code: 0 | 1) => void;
}

const defaultDependencies: CliDependencies = {
  migrate: migrateSqliteToPostgres,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  setExitCode: (code) => { process.exitCode = code; },
};

async function runBuiltInReadinessCommand(
  command: Exclude<ParsedCommand['command'], 'migrate'>,
  parsed: ParsedCommand,
): Promise<ReadinessReport> {
  if (command === 'backup') {
    const sourcePath = parsed.values.get('source') || '';
    const outputDirectory = parsed.values.get('output') || '';
    const runId = parsed.values.get('run-id') || '';
    const resources = parsed.values.get('resources');
    const freezeReceiptSha256 = parsed.values.get('freeze-receipt-sha256') || '';
    if (!sourcePath || !outputDirectory || !runId) {
      throw new Error('Usage: pnpm migrate -- backup --source <sqlite> --output <dir> --resources <dir1,dir2> --run-id <id> [--freeze-receipt-sha256 <sha256>] [--execute]');
    }
    return runBackup({
      runId,
      sourcePath: path.resolve(sourcePath),
      outputDirectory: path.resolve(outputDirectory),
      resourceDirectories: resources ? resources.split(',').map((entry) => path.resolve(entry.trim())).filter(Boolean) : [],
      execute: parsed.execute,
      freezeReceiptSha256: freezeReceiptSha256 || undefined,
    });
  }
  if (command === 'verify-backup') {
    if (parsed.execute) throw new Error('verify-backup is read-only and does not accept --execute');
    const backupDirectory = parsed.values.get('backup') || '';
    const manifestPath = parsed.values.get('manifest') || '';
    const outputDirectory = parsed.values.get('output') || '';
    const runId = parsed.values.get('run-id') || '';
    if (!backupDirectory || !manifestPath || !outputDirectory || !runId) {
      throw new Error('Usage: verify-backup --backup <dir> --manifest <json> --output <dir> --run-id <id>');
    }
    return runVerifyBackup({
      runId,
      backupDirectory: path.resolve(backupDirectory),
      manifestPath: path.resolve(manifestPath),
      outputDirectory: path.resolve(outputDirectory),
    });
  }
  if (command === 'restore-drill') {
    const backupDirectory = parsed.values.get('backup') || '';
    const manifestPath = parsed.values.get('manifest') || '';
    const resourceMapPath = parsed.values.get('resource-map') || '';
    const restoreDirectory = parsed.values.get('restore-output') || '';
    const outputDirectory = parsed.values.get('output') || '';
    const runId = parsed.values.get('run-id') || '';
    if (!backupDirectory || !manifestPath || !resourceMapPath || !restoreDirectory || !outputDirectory || !runId) {
      throw new Error('Usage: restore-drill --backup <dir> --manifest <json> --resource-map <json> --restore-output <dir> --output <dir> --run-id <id> [--execute]');
    }
    return runRestoreDrill({
      runId,
      backupDirectory: path.resolve(backupDirectory),
      manifestPath: path.resolve(manifestPath),
      resourceMapPath: path.resolve(resourceMapPath),
      restoreDirectory: path.resolve(restoreDirectory),
      outputDirectory: path.resolve(outputDirectory),
      execute: parsed.execute,
    });
  }
  if (command === 'prepare-signoff') {
    if (parsed.execute) throw new Error('prepare-signoff is read-only and does not accept --execute');
    const reports = parsed.values.get('reports') || '';
    const outputDirectory = parsed.values.get('output') || '';
    const runId = parsed.values.get('run-id') || '';
    const releaseCandidate = parsed.values.get('release-candidate') || '';
    const goLiveOwner = parsed.values.get('go-live-owner') || '';
    const rollbackOwner = parsed.values.get('rollback-owner') || '';
    if (!reports || !releaseCandidate || !goLiveOwner || !rollbackOwner || !outputDirectory || !runId) {
      throw new Error('Usage: prepare-signoff --reports <comma-separated-json> --release-candidate <git-sha> --go-live-owner <name> --rollback-owner <name> --output <dir> --run-id <id>');
    }
    return (await runPrepareSignoff({
      runId,
      releaseCandidate,
      reportPaths: reports.split(',').map((entry) => path.resolve(entry.trim())).filter(Boolean),
      outputDirectory: path.resolve(outputDirectory),
      goLiveOwner,
      rollbackOwner,
    })).report;
  }
  if (command === 'validate') {
    const sourceSnapshotPath = parsed.values.get('source-snapshot') || '';
    const sourceManifestPath = parsed.values.get('manifest') || '';
    const migrationReportPath = parsed.values.get('migration-report') || '';
    const targetUrl = process.env.DATABASE_URL || '';
    const targetSchema = parsed.values.get('schema') || process.env.DATABASE_SCHEMA || 'consensus';
    const outputDirectory = parsed.values.get('output') || '';
    const runId = parsed.values.get('run-id') || '';
    if (!sourceSnapshotPath || !sourceManifestPath || !migrationReportPath || !targetUrl || !outputDirectory || !runId) {
      throw new Error('Usage: set DATABASE_URL, then run validate --source-snapshot <sqlite> --manifest <json> --migration-report <json> --schema <schema> --output <dir> --run-id <id>');
    }
    return runValidation({
      runId,
      sourceSnapshotPath: path.resolve(sourceSnapshotPath),
      sourceManifestPath: path.resolve(sourceManifestPath),
      migrationReportPath: path.resolve(migrationReportPath),
      targetUrl,
      targetSchema,
      outputDirectory: path.resolve(outputDirectory),
    });
  }
  if (command === 'rehearse') {
    if (parsed.values.has('target')) {
      throw Object.assign(
        new Error('Rehearsal target must be provided through DATABASE_URL'),
        { code: 'REHEARSAL_TARGET_ARG_FORBIDDEN' as const },
      );
    }
    const sourceSnapshotPath = parsed.values.get('source-snapshot') || '';
    const sourceManifestPath = parsed.values.get('manifest') || '';
    const targetUrl = process.env.DATABASE_URL || '';
    const outputDirectory = parsed.values.get('output') || '';
    const runId = parsed.values.get('run-id') || '';
    if (!sourceSnapshotPath || !sourceManifestPath || !targetUrl || !outputDirectory || !runId) {
      throw new Error('Usage: set DATABASE_URL, then run rehearse --source-snapshot <sqlite> --manifest <json> --output <dir> --run-id <id> [--execute]');
    }
    return (await runRehearsal({
      runId,
      sourceSnapshotPath: path.resolve(sourceSnapshotPath),
      sourceManifestPath: path.resolve(sourceManifestPath),
      targetUrl,
      outputDirectory: path.resolve(outputDirectory),
      execute: parsed.execute,
    })).report;
  }
  if (command === 'release-readiness') {
    if (parsed.execute) throw new Error('release-readiness is read-only and does not accept --execute');
    const reports = parsed.values.get('reports') || '';
    const operatorSignoffPath = parsed.values.get('operator-signoff') || '';
    const outputDirectory = parsed.values.get('output') || '';
    const runId = parsed.values.get('run-id') || '';
    const releaseCandidate = parsed.values.get('release-candidate') || '';
    if (!reports || !operatorSignoffPath || !releaseCandidate || !outputDirectory || !runId) {
      throw new Error('Usage: release-readiness --reports <comma-separated-json> --operator-signoff <json> --release-candidate <40-char-git-sha> --output <dir> --run-id <id>');
    }
    return runReleaseReadiness({
      runId,
      releaseCandidate,
      reportPaths: reports.split(',').map((entry) => path.resolve(entry.trim())).filter(Boolean),
      outputDirectory: path.resolve(outputDirectory),
      operatorSignoffPath: path.resolve(operatorSignoffPath),
    });
  }
  if (command === 'cutover') {
    return runCutoverCli(parsed);
  }
  if (command !== 'preflight') throw commandNotImplemented(command);
  const sourcePath = parsed.values.get('source') || '';
  const targetUrl = process.env.DATABASE_URL || '';
  const targetSchema = parsed.values.get('schema') || process.env.DATABASE_SCHEMA || 'consensus';
  const outputDirectory = parsed.values.get('output') || '';
  const resources = parsed.values.get('resources');
  const requireTls = parsed.values.get('require-tls');
  if (!sourcePath || !targetUrl || !outputDirectory || requireTls === undefined) {
    throw new Error('Usage: set DATABASE_URL, then run preflight --source <sqlite> --schema <schema> --output <dir> --resources <dir1,dir2> --require-tls <true|false>');
  }
  if (requireTls !== 'true' && requireTls !== 'false') throw new Error('--require-tls must be true or false');
  return runPreflight({
    runId: parsed.values.get('run-id') || `preflight-${Date.now()}`,
    sourcePath: path.resolve(sourcePath),
    targetUrl,
    targetSchema,
    outputDirectory: path.resolve(outputDirectory),
    resourceDirectories: resources ? resources.split(',').map((entry) => path.resolve(entry.trim())).filter(Boolean) : [],
    requireTls: requireTls === 'true',
  });
}
function commandNotImplemented(command: string): Error & { code: 'COMMAND_NOT_IMPLEMENTED' } {
  return Object.assign(new Error(`Command is not implemented: ${command}`), { code: 'COMMAND_NOT_IMPLEMENTED' as const });
}
function writeJson(stdout: (line: string) => void, payload: unknown): void {
  stdout(JSON.stringify(sanitizeForOutput(payload)));
}

async function main(argv = process.argv.slice(2), overrides: Partial<CliDependencies> = {}): Promise<void> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const parsed = parseCommandLine(argv);
  assertCutoverCliOptions(parsed);
  if (isDeploymentGateCommand(parsed.command)) {
    writeJson(dependencies.stdout, await runDeploymentGateCommand(parsed.command, parsed));
    dependencies.setExitCode(0);
    return;
  }
  if ((parsed.command === 'preflight' || parsed.command === 'validate') && parsed.values.has('target')) {
    const code = parsed.command === 'preflight' ? 'PREFLIGHT_TARGET_ARG_FORBIDDEN' : 'VALIDATION_TARGET_ARG_FORBIDDEN';
    throw Object.assign(new Error(`${parsed.command} target must be provided through DATABASE_URL`), { code });
  }
  if (parsed.command !== 'migrate') {
    const report = await (dependencies.runReadinessCommand || runBuiltInReadinessCommand)(parsed.command, parsed);
    writeJson(dependencies.stdout, report);
    dependencies.setExitCode(readinessReportExitCode(report));
    return;
  }
  const source = parsed.values.get('source');
  const sourcePath = path.resolve(source || '');
  const targetUrl = parsed.values.get('target') || process.env.DATABASE_URL || '';
  const targetSchema = parsed.values.get('schema') || process.env.DATABASE_SCHEMA || 'consensus';
  if (!source || !targetUrl) throw new Error('Usage: pnpm migrate -- --source <sqlite> --target <postgres-url> [--schema consensus]');
  try {
    const report = await dependencies.migrate({ sourcePath, targetUrl, targetSchema });
    writeJson(dependencies.stdout, report);
    dependencies.stderr(`Imported ${Object.values(report.tables).reduce((sum, item) => sum + item.importedRows, 0)} rows; validation passed in ${report.durationMs}ms.`);
  } catch (error) {
    const report = (error as Error & { migrationReport?: MigrationReport }).migrationReport;
    if (report) writeJson(dependencies.stdout, report);
    throw error;
  }
}
if (require.main === module) {
  void main().catch((error) => {
    const code = (error as Error & { code?: string }).code || 'COMMAND_FAILED';
    const message = redactSecrets((error as Error).message);
    console.log(JSON.stringify(sanitizeForOutput({ code, message })));
    console.error(`${code}: ${message}`);
    process.exitCode = 1;
  });
}

export { main };
