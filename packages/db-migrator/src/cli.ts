import path from 'node:path';
import { migrateSqliteToPostgres } from './importer';
import type { MigrationReport } from './types';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const sourcePath = path.resolve(argument('source') || '');
  const targetUrl = argument('target') || process.env.DATABASE_URL || '';
  const targetSchema = argument('schema') || process.env.DATABASE_SCHEMA || 'consensus';
  if (!argument('source') || !targetUrl) throw new Error('Usage: pnpm migrate -- --source <sqlite> --target <postgres-url> [--schema consensus]');
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

void main().catch((error) => { console.error((error as Error).message); process.exitCode = 1; });

export { main };
