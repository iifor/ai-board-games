import path from 'node:path';
import { migrateSqliteToPostgres } from './importer';
import { parseCommandLine } from './cli/arguments';
import { redactSecrets } from './reporting/reportWriter';
import type { MigrationReport } from './types';

function commandNotImplemented(command: string): Error & { code: 'COMMAND_NOT_IMPLEMENTED' } {
  return Object.assign(new Error(`Command is not implemented: ${command}`), { code: 'COMMAND_NOT_IMPLEMENTED' as const });
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseCommandLine(argv);
  if (parsed.command !== 'migrate') throw commandNotImplemented(parsed.command);
  const source = parsed.values.get('source');
  const sourcePath = path.resolve(source || '');
  const targetUrl = parsed.values.get('target') || process.env.DATABASE_URL || '';
  const targetSchema = parsed.values.get('schema') || process.env.DATABASE_SCHEMA || 'consensus';
  if (!source || !targetUrl) throw new Error('Usage: pnpm migrate -- --source <sqlite> --target <postgres-url> [--schema consensus]');
  try {
    const report = await migrateSqliteToPostgres({ sourcePath, targetUrl, targetSchema });
    console.log(JSON.stringify(report));
    console.error(`Imported ${Object.values(report.tables).reduce((sum, item) => sum + item.importedRows, 0)} rows; validation passed in ${report.durationMs}ms.`);
  } catch (error) {
    const report = (error as Error & { migrationReport?: MigrationReport }).migrationReport;
    if (report) console.log(JSON.stringify(report));
    throw error;
  }
}

if (require.main === module) {
  void main().catch((error) => {
    const code = (error as Error & { code?: string }).code || 'COMMAND_FAILED';
    const message = redactSecrets((error as Error).message);
    console.log(JSON.stringify({ code, message }));
    console.error(`${code}: ${message}`);
    process.exitCode = 1;
  });
}

export { main };
