import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { runValidation, type ValidateOptions } from '../commands/validate';
import { createCutoverValidationExecutor } from '../postgres/cutoverValidationExecutor';
import { writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessReport } from '../reporting/reportTypes';
import type { MigrationReport } from '../types';

export interface CutoverValidationOptions extends ValidateOptions {
  migration: MigrationReport;
  ca: string;
  sourceDatabase: Database.Database;
}

export interface CutoverValidationDependencies {
  runValidation: typeof runValidation;
}

const defaultDependencies: CutoverValidationDependencies = { runValidation };

function ioFailure(): Error & { code: 'CUTOVER_VALIDATION_IO_FAILED' } {
  return Object.assign(new Error('Production cutover validation staging failed'), {
    code: 'CUTOVER_VALIDATION_IO_FAILED' as const,
  });
}

function borrowSourceDatabase(database: Database.Database): Database.Database {
  return new Proxy(database, {
    get(target, property) {
      if (property === 'close') return () => undefined;
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export async function runCutoverValidation(
  options: CutoverValidationOptions,
  dependencies: Partial<CutoverValidationDependencies> = {},
): Promise<ReadinessReport> {
  const resolved = { ...defaultDependencies, ...dependencies };
  let temporaryDirectory: string | undefined;
  let result: ReadinessReport | undefined;
  let primaryError: unknown;
  try {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-cutover-validation-'));
    const migrationReportPath = path.join(temporaryDirectory, 'migration.json');
    await fs.writeFile(migrationReportPath, `${JSON.stringify(options.migration, null, 2)}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    });
    result = await resolved.runValidation({
      runId: options.runId,
      sourceSnapshotPath: options.sourceSnapshotPath,
      sourceManifestPath: options.sourceManifestPath,
      migrationReportPath,
      targetUrl: options.targetUrl,
      targetSchema: options.targetSchema,
      outputDirectory: options.outputDirectory,
    }, {
      createSqlite: (sourcePath) => {
        if (path.resolve(sourcePath) !== path.resolve(options.sourceSnapshotPath)) throw ioFailure();
        return borrowSourceDatabase(options.sourceDatabase);
      },
      createPostgres: (targetUrl, schema) => createCutoverValidationExecutor(targetUrl, schema, options.ca),
      writeReport: ({ outputDirectory, report }) => writeReadinessReport({
        outputDirectory,
        report: { ...report, schema: options.targetSchema },
      }),
    });
    result = { ...result, schema: options.targetSchema };
  } catch (error) {
    primaryError = error;
  }
  if (temporaryDirectory) {
    try { await fs.rm(temporaryDirectory, { recursive: true, force: true }); }
    catch { throw ioFailure(); }
  }
  if (primaryError) {
    if ((primaryError as { code?: string }).code) throw primaryError;
    throw ioFailure();
  }
  return result!;
}
