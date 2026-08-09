import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseCommandLine } from '../../packages/db-migrator/src/cli/arguments';
import { readinessReportExitCode, redactSecrets, writeReadinessReport } from '../../packages/db-migrator/src/reporting/reportWriter';
import type { ReadinessReport } from '../../packages/db-migrator/src/reporting/reportTypes';

function createReport(status: ReadinessReport['status'] = 'passed'): ReadinessReport {
  return {
    runId: 'run-20260809-001',
    stage: 'preflight',
    status,
    startedAt: '2026-08-09T00:00:00.000Z',
    finishedAt: '2026-08-09T00:00:01.000Z',
    durationMs: 1000,
    checks: [{
      id: 'database-url',
      status: 'passed',
      expected: 'postgresql://user:secret@host/db',
      actual: 'DATABASE_URL=postgresql://user:secret@host/db JWT_SECRET=jwt API_KEY=key',
      message: 'Connected with postgresql://user:secret@host/db',
    }],
    artifacts: [{ type: 'migration-report', path: 'postgresql://user:secret@host/db' }],
    errors: [{ code: 'CONNECTION_FAILED', message: 'DATABASE_URL=postgresql://user:secret@host/db JWT_SECRET=jwt API_KEY=key' }],
  };
}

test('readiness reports write sanitized JSON and Markdown without leftover temporary files', async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-report-'));
  try {
    const written = await writeReadinessReport({ outputDirectory, report: createReport() });
    const json = fs.readFileSync(written.jsonPath, 'utf8');
    const markdown = fs.readFileSync(written.markdownPath, 'utf8');

    assert.ok(fs.existsSync(written.jsonPath));
    assert.ok(fs.existsSync(written.markdownPath));
    assert.equal(fs.readdirSync(outputDirectory).some((name) => name.endsWith('.tmp')), false);
    assert.match(json, /postgresql:\/\/user:\*\*\*@host\/db/);
    assert.match(markdown, /postgresql:\/\/user:\*\*\*@host\/db/);
    for (const secret of ['secret', 'JWT_SECRET=jwt', 'API_KEY=key', 'DATABASE_URL=postgresql://user:secret@host/db']) {
      assert.doesNotMatch(json, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.doesNotMatch(markdown, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('readiness reports reject an existing run instead of overwriting it', async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-report-'));
  try {
    await writeReadinessReport({ outputDirectory, report: createReport('failed') });
    await assert.rejects(
      () => writeReadinessReport({ outputDirectory, report: createReport('failed') }),
      (error: unknown) => (error as NodeJS.ErrnoException).code === 'REPORT_ALREADY_EXISTS',
    );
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('readiness reports preserve an existing temporary file for the same run', async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-report-'));
  const temporaryPath = path.join(outputDirectory, 'run-20260809-001-preflight.json.tmp');
  fs.writeFileSync(temporaryPath, 'another writer');
  try {
    await assert.rejects(
      () => writeReadinessReport({ outputDirectory, report: createReport() }),
      (error: unknown) => (error as NodeJS.ErrnoException).code === 'REPORT_ALREADY_EXISTS',
    );
    assert.equal(fs.readFileSync(temporaryPath, 'utf8'), 'another writer');
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('command parser preserves legacy migration and rejects duplicate options', () => {
  const legacy = parseCommandLine(['--', '--source', 'source.sqlite', '--target', 'postgresql://host/db']);
  assert.equal(legacy.command, 'migrate');
  assert.equal(legacy.values.get('source'), 'source.sqlite');
  assert.equal(legacy.execute, false);
  assert.equal(parseCommandLine(['--', 'preflight']).command, 'preflight');
  assert.throws(() => parseCommandLine(['preflight', '--output', 'a', '--output', 'b']), /Duplicate option/);
});

test('redaction sanitizes environment assignments when a URL cannot be parsed', () => {
  assert.equal(redactSecrets('DATABASE_URL=not-a-url JWT_SECRET=jwt API_KEY=key'), 'DATABASE_URL=*** JWT_SECRET=*** API_KEY=***');
});

test('redaction removes extended environment credential names and quoted values', () => {
  assert.equal(
    redactSecrets(`PGPASSWORD=postgres DB_PASSWORD="database password" SERVICE_API_KEY='service api key' AUTH_TOKEN=token`),
    'PGPASSWORD=*** DB_PASSWORD=*** SERVICE_API_KEY=*** AUTH_TOKEN=***',
  );
});

test('readiness status maps to stable process exit codes', () => {
  assert.equal(readinessReportExitCode(createReport('passed')), 0);
  assert.equal(readinessReportExitCode(createReport('failed')), 1);
});
