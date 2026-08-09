import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ReadinessReport } from './reportTypes';

export interface WriteReportOptions {
  outputDirectory: string;
  report: ReadinessReport;
}

export interface WrittenReport {
  jsonPath: string;
  markdownPath: string;
}

const SENSITIVE_ASSIGNMENTS = /\b([A-Z][A-Z0-9_]*(?:URL|SECRET|PASSWORD|PASSWD|API_KEY|TOKEN|KEY))=(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;]+)/gi;
const CONNECTION_URL = /\b(?:postgres|postgresql):\/\/[^\s'"`<>]+/gi;

export function redactSecrets(value: string): string {
  const withRedactedUrls = value.replace(CONNECTION_URL, (candidate) => {
    try {
      const url = new URL(candidate);
      if (!url.password) return candidate;
      url.password = '***';
      return url.toString();
    } catch {
      return candidate;
    }
  });
  return withRedactedUrls.replace(SENSITIVE_ASSIGNMENTS, '$1=***');
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

async function writeTemporaryFile(tempPath: string, content: string): Promise<void> {
  const handle = await fs.open(tempPath, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function reportExistsError(jsonPath: string, markdownPath: string): Error & { code: 'REPORT_ALREADY_EXISTS' } {
  return Object.assign(new Error(`Readiness report already exists: ${jsonPath} or ${markdownPath}`), {
    code: 'REPORT_ALREADY_EXISTS' as const,
  });
}

export async function writeReadinessReport(options: WriteReportOptions): Promise<WrittenReport> {
  const { outputDirectory, report } = options;
  const sanitizedReport = sanitizeReport(report);
  await fs.mkdir(outputDirectory, { recursive: true });

  const basename = `${report.runId}-${report.stage}`;
  const jsonPath = path.join(outputDirectory, `${basename}.json`);
  const markdownPath = path.join(outputDirectory, `${basename}.md`);
  const jsonTempPath = `${jsonPath}.tmp`;
  const markdownTempPath = `${markdownPath}.tmp`;
  const existing = await Promise.all([jsonPath, markdownPath, jsonTempPath, markdownTempPath].map(async (candidate) => {
    try {
      await fs.access(candidate);
      return true;
    } catch {
      return false;
    }
  }));
  if (existing.some(Boolean)) throw reportExistsError(jsonPath, markdownPath);

  const createdTempPaths: string[] = [];
  let jsonPublished = false;
  try {
    await writeTemporaryFile(jsonTempPath, `${JSON.stringify(sanitizedReport, null, 2)}\n`);
    createdTempPaths.push(jsonTempPath);
    await writeTemporaryFile(markdownTempPath, renderMarkdown(sanitizedReport));
    createdTempPaths.push(markdownTempPath);
    await fs.rename(jsonTempPath, jsonPath);
    jsonPublished = true;
    await fs.rename(markdownTempPath, markdownPath);
  } catch (error) {
    await Promise.all(createdTempPaths.map((candidate) => fs.rm(candidate, { force: true })));
    if (jsonPublished) await fs.rm(jsonPath, { force: true });
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw reportExistsError(jsonPath, markdownPath);
    throw error;
  }
  return { jsonPath, markdownPath };
}
