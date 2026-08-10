import path from 'node:path';
import { migrateSqliteToPostgres } from './importer';
import { parseCommandLine, type ParsedCommand } from './cli/arguments';
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

function commandNotImplemented(command: string): Error & { code: 'COMMAND_NOT_IMPLEMENTED' } {
  return Object.assign(new Error(`Command is not implemented: ${command}`), { code: 'COMMAND_NOT_IMPLEMENTED' as const });
}

function writeJson(stdout: (line: string) => void, payload: unknown): void {
  stdout(JSON.stringify(sanitizeForOutput(payload)));
}

async function main(argv = process.argv.slice(2), overrides: Partial<CliDependencies> = {}): Promise<void> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const parsed = parseCommandLine(argv);
  if (parsed.command !== 'migrate') {
    if (!dependencies.runReadinessCommand) throw commandNotImplemented(parsed.command);
    const report = await dependencies.runReadinessCommand(parsed.command, parsed);
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
