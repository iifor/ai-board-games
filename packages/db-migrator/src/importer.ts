import fs from 'node:fs';
import Database from 'better-sqlite3';
import { Client } from 'pg';
import { IDENTITY_TABLES, IMPORT_TABLES, SKIPPED_TABLES } from './constants';
import type {
  MigrationClient,
  MigrationDependencies,
  MigrationOptions,
  MigrationReport,
  TableReport,
} from './types';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const MIGRATION_FAILURE_REPORT_ERROR = 'MIGRATION_IMPORT_FAILED: SQLite to PostgreSQL import failed';

function quoteIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  return `"${value}"`;
}

function normalizeValue(column: string, value: unknown, table: string, rowIndex: number): unknown {
  if (value == null) return null;
  if (column.endsWith('_json')) {
    try { return JSON.stringify(JSON.parse(String(value))); }
    catch { throw new Error(`${table}[${rowIndex}].${column} contains invalid JSON`); }
  }
  if (column.endsWith('_at')) {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new Error(`${table}[${rowIndex}].${column} contains an invalid timestamp`);
    return date.toISOString();
  }
  return value;
}

async function assertEmptyTarget(client: MigrationClient, schema: string): Promise<void> {
  for (const table of IMPORT_TABLES) {
    const result = await client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`);
    if (Number(result.rows[0]?.count || 0) > 0) throw new Error(`Target table is not empty: ${schema}.${table}`);
  }
}

async function targetColumns(client: MigrationClient, schema: string, table: string): Promise<Set<string>> {
  const result = await client.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [schema, table]);
  if (!result.rowCount) throw new Error(`Target table does not exist: ${schema}.${table}`);
  return new Set(result.rows.map((row) => row.column_name));
}

async function importTable(sqlite: Database.Database, client: MigrationClient, schema: string, table: string): Promise<TableReport> {
  const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  const rows = exists ? sqlite.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as Record<string, unknown>[] : [];
  const allowed = await targetColumns(client, schema, table);
  let importedRows = 0;
  for (const [rowIndex, row] of rows.entries()) {
    const columns = Object.keys(row).filter((column) => allowed.has(column));
    const values = columns.map((column) => normalizeValue(column, row[column], table, rowIndex));
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    await client.query(`INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${placeholders})`, values);
    importedRows += 1;
  }
  const target = await client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`);
  return { sourceRows: rows.length, targetRows: Number(target.rows[0]?.count || 0), importedRows };
}

async function resetIdentities(client: MigrationClient, tables: readonly string[]): Promise<void> {
  for (const table of tables) {
    await client.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${quoteIdentifier(table)}), 1),
      EXISTS (SELECT 1 FROM ${quoteIdentifier(table)}))`, [table]);
  }
}

const defaultDependencies: MigrationDependencies = {
  createClient: async (options) => new Client({ connectionString: options.targetUrl }) as unknown as MigrationClient,
};

export async function migrateSqliteToPostgres(
  options: MigrationOptions,
  dependencies: Partial<MigrationDependencies> = {},
): Promise<MigrationReport> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const schema = options.targetSchema || 'consensus';
  if (!fs.existsSync(options.sourcePath)) throw new Error(`SQLite source does not exist: ${options.sourcePath}`);
  quoteIdentifier(schema);
  const sqlite = new Database(options.sourcePath, { readonly: true, fileMustExist: true });
  const resolved = { ...defaultDependencies, ...dependencies };
  let client: MigrationClient | undefined;
  const tables: Record<string, TableReport> = {};
  const report = (): MigrationReport => ({ status: 'succeeded', sourcePath: options.sourcePath,
    targetSchema: schema, startedAt, durationMs: Date.now() - started, tables,
    skippedTables: [...SKIPPED_TABLES], errors: [], validation: 'passed' });
  try {
    client = await resolved.createClient(options);
    await client.connect();
    await client.query(`SET search_path TO ${quoteIdentifier(schema)}, public`);
    await client.query('BEGIN');
    await assertEmptyTarget(client, schema);
    for (const table of IMPORT_TABLES) tables[table] = await importTable(sqlite, client, schema, table);
    await resetIdentities(client, IDENTITY_TABLES);
    for (const [table, counts] of Object.entries(tables)) {
      if (counts.sourceRows !== counts.targetRows) throw new Error(`Row-count mismatch for ${table}`);
    }
    await client.query('COMMIT');
    return report();
  } catch (error) {
    try { await client?.query('ROLLBACK'); } catch { /* connection may already be lost */ }
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { migrationReport: {
      ...report(), status: 'failed', validation: 'failed', errors: [MIGRATION_FAILURE_REPORT_ERROR],
    } satisfies MigrationReport });
  } finally {
    sqlite.close();
    await client?.end().catch(() => undefined);
  }
}
