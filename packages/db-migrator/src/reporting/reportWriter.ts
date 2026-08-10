import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ReadinessReport } from './reportTypes';

export interface ReportFileHandle {
  writeFile(content: string): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface ReportFileSystem {
  mkdir(directory: string): Promise<void>;
  open(candidate: string, flags: 'wx'): Promise<ReportFileHandle>;
  link(source: string, destination: string): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
  rm(candidate: string): Promise<void>;
  stat(candidate: string): Promise<{ dev: number | bigint; ino: number | bigint }>;
}

export interface WriteReportOptions {
  outputDirectory: string;
  report: ReadinessReport;
  fileSystem?: ReportFileSystem;
}

export interface WrittenReport {
  jsonPath: string;
  markdownPath: string;
}

export type PublishedFileRollbackResult = 'removed-owned' | 'preserved-foreign' | 'rollback-incomplete';

export interface PublishedFileIdentity {
  dev: string;
  ino: string;
}

export interface RollbackOwnedPublishedFileOptions {
  referencePath: string;
  finalPath: string;
  expectedIdentity?: PublishedFileIdentity;
  fileSystem?: ReportFileSystem;
}

const SENSITIVE_ASSIGNMENTS = /\b([A-Z][A-Z0-9_]*(?:URL|SECRET|PASSWORD|PASSWD|API_KEY|TOKEN|KEY))=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;]+)/gi;
const DATABASE_URL_SCHEME = /\bpostgres(?:ql)?:\/\//gi;
const REDACTED_DATABASE_URL = '[REDACTED_DATABASE_URL]';

const defaultFileSystem: ReportFileSystem = {
  mkdir: async (directory) => { await fs.mkdir(directory, { recursive: true }); },
  open: async (candidate, flags) => {
    const handle = await fs.open(candidate, flags);
    return {
      writeFile: (content) => handle.writeFile(content, 'utf8').then(() => undefined),
      sync: () => handle.sync(),
      close: () => handle.close(),
    };
  },
  link: (source, destination) => fs.link(source, destination),
  rename: (source, destination) => fs.rename(source, destination),
  rm: (candidate) => fs.rm(candidate, { force: true }),
  stat: (candidate) => fs.stat(candidate, { bigint: true }),
};

function isWhitespaceOrControl(character: string): boolean {
  return /\s/u.test(character) || character.charCodeAt(0) <= 0x20;
}

function databaseUrlEnd(value: string, schemeEnd: number): number {
  // Malformed credentials can contain quotes and structural punctuation, so only whitespace proves a boundary.
  for (let index = schemeEnd; index < value.length; index += 1) {
    if (isWhitespaceOrControl(value[index])) return index;
  }
  return value.length;
}

function redactDatabaseUrls(value: string): string {
  DATABASE_URL_SCHEME.lastIndex = 0;
  let cursor = 0;
  let redacted = '';
  let match: RegExpExecArray | null;
  while ((match = DATABASE_URL_SCHEME.exec(value)) !== null) {
    const wrapperStart = value[match.index - 1] === "'" || value[match.index - 1] === '"'
      ? match.index - 1
      : match.index;
    redacted += value.slice(cursor, wrapperStart);
    redacted += REDACTED_DATABASE_URL;
    cursor = databaseUrlEnd(value, DATABASE_URL_SCHEME.lastIndex);
    DATABASE_URL_SCHEME.lastIndex = cursor;
  }
  return cursor === 0 ? value : redacted + value.slice(cursor);
}

export function redactSecrets(value: string): string {
  const withRedactedUrls = redactDatabaseUrls(value);
  return withRedactedUrls.replace(SENSITIVE_ASSIGNMENTS, (_match, name: string, rawValue: string) => {
    return `${name}=${rawValue.includes(REDACTED_DATABASE_URL) ? REDACTED_DATABASE_URL : '***'}`;
  });
}

export function sanitizeForOutput<T>(value: T): T {
  if (typeof value === 'string') return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeForOutput(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeForOutput(item)]),
    ) as T;
  }
  return value;
}

export function readinessReportExitCode(report: ReadinessReport): 0 | 1 {
  return report.status === 'passed' ? 0 : 1;
}

function sanitizeReport(report: ReadinessReport): ReadinessReport {
  return {
    ...report,
    checks: report.checks.map((check) => ({
      ...check,
      expected: check.expected === undefined ? undefined : redactSecrets(check.expected),
      actual: check.actual === undefined ? undefined : redactSecrets(check.actual),
      message: redactSecrets(check.message),
    })),
    artifacts: report.artifacts.map((artifact) => ({ ...artifact, path: redactSecrets(artifact.path) })),
    errors: report.errors.map((error) => ({ ...error, message: redactSecrets(error.message) })),
  };
}

function renderMarkdown(report: ReadinessReport): string {
  const checks = report.checks.length
    ? report.checks.map((check) => `| ${check.id} | ${check.status} | ${check.message} |`).join('\n')
    : '| - | - | - |';
  const artifacts = report.artifacts.length
    ? report.artifacts.map((artifact) => `| ${artifact.path} | ${artifact.sha256 || '-'} |`).join('\n')
    : '| - | - |';

  return [
    '# Readiness report',
    '',
    `Run: ${report.runId}`,
    `Stage: ${report.stage}`,
    `Status: ${report.status}`,
    `Duration: ${report.durationMs}ms`,
    '',
    '## Checks',
    '',
    '| ID | Status | Message |',
    '| --- | --- | --- |',
    checks,
    '',
    '## Artifacts',
    '',
    '| Path | SHA-256 |',
    '| --- | --- |',
    artifacts,
    '',
  ].join('\n');
}

async function writeTemporaryFile(fileSystem: ReportFileSystem, tempPath: string, content: string): Promise<void> {
  let handle: ReportFileHandle | undefined;
  let closed = false;
  try {
    handle = await fileSystem.open(tempPath, 'wx');
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    closed = true;
  } catch (error) {
    if (handle && !closed) {
      try { await handle.close(); } catch { /* retrying cleanup is best effort */ }
    }
    if (handle) await fileSystem.rm(tempPath);
    throw error;
  }
}

function reportExistsError(jsonPath: string, markdownPath: string): Error & { code: 'REPORT_ALREADY_EXISTS' } {
  return Object.assign(new Error(`Readiness report already exists: ${jsonPath} or ${markdownPath}`), {
    code: 'REPORT_ALREADY_EXISTS' as const,
  });
}

export async function writeReadinessReport(options: WriteReportOptions): Promise<WrittenReport> {
  const { outputDirectory, report, fileSystem = defaultFileSystem } = options;
  const sanitizedReport = sanitizeReport(report);
  await fileSystem.mkdir(outputDirectory);

  const basename = `${report.runId}-${report.stage}`;
  const jsonPath = path.join(outputDirectory, `${basename}.json`);
  const markdownPath = path.join(outputDirectory, `${basename}.md`);
  const jsonTempPath = `${jsonPath}.tmp`;
  const markdownTempPath = `${markdownPath}.tmp`;
  const createdTempPaths: string[] = [];
  let jsonPublished = false;
  try {
    await writeTemporaryFile(fileSystem, jsonTempPath, `${JSON.stringify(sanitizedReport, null, 2)}\n`);
    createdTempPaths.push(jsonTempPath);
    await writeTemporaryFile(fileSystem, markdownTempPath, renderMarkdown(sanitizedReport));
    createdTempPaths.push(markdownTempPath);
    await fileSystem.link(jsonTempPath, jsonPath);
    jsonPublished = true;
    await fileSystem.link(markdownTempPath, markdownPath);
  } catch (error) {
    if (jsonPublished) {
      await rollbackOwnedPublishedFile({ referencePath: jsonTempPath, finalPath: jsonPath, fileSystem });
    }
    await Promise.all(createdTempPaths.map((candidate) => fileSystem.rm(candidate)));
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw reportExistsError(jsonPath, markdownPath);
    throw error;
  }
  await Promise.all(createdTempPaths.map((candidate) => fileSystem.rm(candidate)));
  return { jsonPath, markdownPath };
}

export function publishedFileIdentity(
  stats: { dev: number | bigint; ino: number | bigint },
): PublishedFileIdentity | null {
  const hasReliableIdentity = typeof stats.ino === 'bigint' ? stats.ino > 0n : stats.ino > 0;
  return hasReliableIdentity ? { dev: stats.dev.toString(), ino: stats.ino.toString() } : null;
}

export async function rollbackOwnedPublishedFile(
  options: RollbackOwnedPublishedFileOptions,
): Promise<PublishedFileRollbackResult> {
  const { referencePath, finalPath, expectedIdentity, fileSystem = defaultFileSystem } = options;
  const rollbackPath = `${referencePath}.rollback-${randomUUID()}`;
  try {
    await fileSystem.rename(finalPath, rollbackPath);
  } catch {
    return 'rollback-incomplete';
  }

  try {
    const [reference, quarantined] = await Promise.all([
      expectedIdentity ? Promise.resolve(expectedIdentity) : fileSystem.stat(referencePath).then(publishedFileIdentity),
      fileSystem.stat(rollbackPath).then(publishedFileIdentity),
    ]);
    if (
      reference
      && quarantined
      && reference.dev === quarantined.dev
      && reference.ino === quarantined.ino
    ) {
      try {
        await fileSystem.rm(rollbackPath);
        return 'removed-owned';
      } catch {
        return 'rollback-incomplete';
      }
    }
  } catch {
    // Restore below whenever ownership cannot be proven.
  }

  try {
    await fileSystem.link(rollbackPath, finalPath);
    await fileSystem.rm(rollbackPath).catch(() => undefined);
  } catch {
    // A new final now exists. Preserve the quarantined content rather than deleting either file.
  }
  return 'preserved-foreign';
}
