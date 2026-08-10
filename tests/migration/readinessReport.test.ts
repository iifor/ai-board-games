import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { main } from '../../packages/db-migrator/src/cli';
import { parseCommandLine } from '../../packages/db-migrator/src/cli/arguments';
import { readinessReportExitCode, redactSecrets, writeReadinessReport } from '../../packages/db-migrator/src/reporting/reportWriter';
import type { ReadinessReport } from '../../packages/db-migrator/src/reporting/reportTypes';
import type { MigrationReport } from '../../packages/db-migrator/src/types';
import type { ReportFileSystem } from '../../packages/db-migrator/src/reporting/reportWriter';

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
    assert.match(json, /\[REDACTED_DATABASE_URL\]/);
    assert.match(markdown, /\[REDACTED_DATABASE_URL\]/);
    for (const secret of ['user', 'host', '/db', 'secret', 'JWT_SECRET=jwt', 'API_KEY=key', 'DATABASE_URL=postgresql://user:secret@host/db']) {
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

test('redaction replaces a PostgreSQL URL without retaining any connection component', () => {
  const redacted = redactSecrets('postgresql://db_user:db_password@db.internal:5432/consensus?sslmode=require');
  assert.equal(redacted, '[REDACTED_DATABASE_URL]');
  for (const component of ['db_user', 'db_password', 'db.internal', '5432', 'consensus', 'sslmode']) {
    assert.doesNotMatch(redacted, new RegExp(component));
  }
});

test('redaction consumes an apostrophe inside a PostgreSQL URL instead of leaking its tail', () => {
  const redacted = redactSecrets("postgresql://db_user:pa'ss@db.internal/consensus");
  assert.equal(redacted, '[REDACTED_DATABASE_URL]');
  assert.doesNotMatch(redacted, /ss|db\.internal|consensus/);
});

test('redaction preserves the database URL marker inside a sensitive environment assignment', () => {
  assert.equal(
    redactSecrets('DATABASE_URL="postgresql://db_user:db_password@db.internal:5432/consensus"'),
    'DATABASE_URL=[REDACTED_DATABASE_URL]',
  );
});

test('redaction uses the exact database URL marker across quoting, strings, JSON, and CLI payloads', async () => {
  const marker = '[REDACTED_DATABASE_URL]';
  const cases: Array<[string, string]> = [
    ["DATABASE_URL='postgresql://single_user:single_password@single.host/single_db'", `DATABASE_URL=${marker}`],
    ['DATABASE_URL="postgresql://double_user:double_password@double.host/double_db"', `DATABASE_URL=${marker}`],
    ['DATABASE_URL=postgresql://plain_user:plain_password@plain.host/plain_db', `DATABASE_URL=${marker}`],
    ['{"databaseUrl":"postgresql://json_user:json_password@json.host/json_db"}', `{"databaseUrl":"${marker}"}`],
    ['Connect using postgresql://text_user:text_password@text.host/text_db now', `Connect using ${marker} now`],
  ];
  for (const [input, expected] of cases) assert.equal(redactSecrets(input), expected);

  const output: string[] = [];
  const report = migrationReport('succeeded');
  report.sourcePath = "DATABASE_URL='postgresql://cli_user:cli_password@cli.host/cli_db'";
  report.errors = ['{"databaseUrl":"postgresql://cli_json:cli_secret@cli-json.host/cli_json_db"}'];
  await main(['migrate', '--source', 'source.sqlite', '--target', 'postgresql://target:secret@target.host/db'], {
    migrate: async () => report,
    stdout: (line) => output.push(line),
    stderr: () => undefined,
  });
  const payload = JSON.parse(output[0]) as MigrationReport;
  assert.equal(payload.sourcePath, `DATABASE_URL=${marker}`);
  assert.equal(payload.errors[0], `{"databaseUrl":"${marker}"}`);
});

test('redaction conservatively consumes malformed PostgreSQL URLs through a safe boundary', () => {
  const marker = '[REDACTED_DATABASE_URL]';
  const cases: Array<[string, string]> = [
    ["DATABASE_URL='postgresql://u:pa'ss@apostrophe.host/apostrophe_db", `DATABASE_URL=${marker}`],
    ['DATABASE_URL="postgresql://u:pa"ss@quote.host/quote_db', `DATABASE_URL=${marker}`],
    ["DATABASE_URL='postgresql://u:p@single-unclosed.host/single_db", `DATABASE_URL=${marker}`],
    ['DATABASE_URL="postgresql://u:p@double-unclosed.host/double_db', `DATABASE_URL=${marker}`],
    ["Use postgresql://u:pa'ss@space.host/space_db safely", `Use ${marker} safely`],
    ['{"url":"postgresql://u:pa"ss@json.host/json_db","next":1}', `{"url":"${marker}","next":1}`],
    [
      'first=postgres://u:p@first.host/first_db,second=postgresql://u:p@second.host/second_db',
      `first=${marker},second=${marker}`,
    ],
  ];

  for (const [input, expected] of cases) {
    const redacted = redactSecrets(input);
    assert.equal(redacted, expected);
    for (const leaked of ['ss@', '.host', '_db', 'apostrophe', 'quote', 'unclosed']) {
      assert.doesNotMatch(redacted, new RegExp(leaked));
    }
  }
});

test('readiness status maps to stable process exit codes', () => {
  assert.equal(readinessReportExitCode(createReport('passed')), 0);
  assert.equal(readinessReportExitCode(createReport('failed')), 1);
});

function injectedFileSystem(failure: 'write' | 'sync' | 'close' | null = null): ReportFileSystem {
  return {
    mkdir: async (directory) => { await fs.promises.mkdir(directory, { recursive: true }); },
    open: async (candidate, flags) => {
      const handle = await fs.promises.open(candidate, flags);
      return {
        writeFile: async (content) => {
          await handle.writeFile(content, 'utf8');
          if (failure === 'write') throw new Error('INJECTED_WRITE_FAILURE');
        },
        sync: async () => {
          await handle.sync();
          if (failure === 'sync') throw new Error('INJECTED_SYNC_FAILURE');
        },
        close: async () => {
          await handle.close();
          if (failure === 'close') throw new Error('INJECTED_CLOSE_FAILURE');
        },
      };
    },
    link: (source, destination) => fs.promises.link(source, destination),
    rename: (source, destination) => fs.promises.rename(source, destination),
    rm: (candidate) => fs.promises.rm(candidate, { force: true }),
    stat: (candidate) => fs.promises.stat(candidate),
  };
}

for (const failure of ['write', 'sync', 'close'] as const) {
  test(`readiness report removes its temporary file after injected ${failure} failure`, async () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-report-failure-'));
    try {
      await assert.rejects(
        () => writeReadinessReport({ outputDirectory, report: createReport(), fileSystem: injectedFileSystem(failure) }),
        new RegExp(`INJECTED_${failure.toUpperCase()}_FAILURE`),
      );
      assert.deepEqual(fs.readdirSync(outputDirectory), []);
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
}

test('race-safe publication preserves a final file created immediately before the first publish', async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-report-race-'));
  const original = 'original-json';
  const fileSystem = injectedFileSystem();
  const realLink = fileSystem.link;
  let links = 0;
  fileSystem.link = async (source, destination) => {
    links += 1;
    if (links === 1) fs.writeFileSync(destination, original);
    await realLink(source, destination);
  };
  try {
    await assert.rejects(
      () => writeReadinessReport({ outputDirectory, report: createReport(), fileSystem }),
      (error: unknown) => (error as NodeJS.ErrnoException).code === 'REPORT_ALREADY_EXISTS',
    );
    assert.equal(fs.readFileSync(path.join(outputDirectory, 'run-20260809-001-preflight.json'), 'utf8'), original);
    assert.equal(fs.existsSync(path.join(outputDirectory, 'run-20260809-001-preflight.md')), false);
    assert.equal(fs.readdirSync(outputDirectory).some((name) => name.endsWith('.tmp')), false);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('second publication failure rolls back only this writer and preserves the concurrent final', async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-report-race-'));
  const original = 'original-markdown';
  const fileSystem = injectedFileSystem();
  const realLink = fileSystem.link;
  let links = 0;
  fileSystem.link = async (source, destination) => {
    links += 1;
    if (links === 2) fs.writeFileSync(destination, original);
    await realLink(source, destination);
  };
  try {
    await assert.rejects(
      () => writeReadinessReport({ outputDirectory, report: createReport(), fileSystem }),
      (error: unknown) => (error as NodeJS.ErrnoException).code === 'REPORT_ALREADY_EXISTS',
    );
    assert.equal(fs.existsSync(path.join(outputDirectory, 'run-20260809-001-preflight.json')), false);
    assert.equal(fs.readFileSync(path.join(outputDirectory, 'run-20260809-001-preflight.md'), 'utf8'), original);
    assert.equal(fs.readdirSync(outputDirectory).some((name) => name.endsWith('.tmp')), false);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('rollback preserves a replaced final when filesystem identity cannot prove ownership', async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-report-ownership-'));
  const externalContent = 'external-json';
  const jsonPath = path.join(outputDirectory, 'run-20260809-001-preflight.json');
  const fileSystem = injectedFileSystem();
  const realLink = fileSystem.link;
  let links = 0;
  fileSystem.link = async (source, destination) => {
    links += 1;
    if (links === 1) return realLink(source, destination);
    if (links === 2) {
      fs.rmSync(jsonPath);
      fs.writeFileSync(jsonPath, externalContent);
      throw Object.assign(new Error('INJECTED_SECOND_PUBLICATION_FAILURE'), { code: 'EIO' });
    }
    return realLink(source, destination);
  };
  fileSystem.stat = async () => ({ dev: 0, ino: 0 });
  try {
    await assert.rejects(
      () => writeReadinessReport({ outputDirectory, report: createReport(), fileSystem }),
      /INJECTED_SECOND_PUBLICATION_FAILURE/,
    );
    assert.equal(fs.readFileSync(jsonPath, 'utf8'), externalContent);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('two concurrent writers publish once and return REPORT_ALREADY_EXISTS to the loser', async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-report-concurrent-'));
  try {
    const results = await Promise.allSettled([
      writeReadinessReport({ outputDirectory, report: createReport() }),
      writeReadinessReport({ outputDirectory, report: createReport() }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    assert.equal((rejected?.reason as NodeJS.ErrnoException).code, 'REPORT_ALREADY_EXISTS');
    assert.equal(fs.readdirSync(outputDirectory).some((name) => name.endsWith('.tmp')), false);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

function migrationReport(status: MigrationReport['status']): MigrationReport {
  return {
    status,
    sourcePath: 'postgresql://legacy_user:legacy_password@legacy.host:5432/legacy_db',
    targetSchema: 'consensus',
    startedAt: '2026-08-09T00:00:00.000Z',
    durationMs: 1,
    tables: {},
    skippedTables: [],
    errors: ['postgresql://error_user:error_password@error.host/error_db'],
    validation: status === 'succeeded' ? 'passed' : 'failed',
  };
}

test('CLI sanitizes successful and attached failed migration reports before stdout serialization', async () => {
  const output: string[] = [];
  await main(['migrate', '--source', 'source.sqlite', '--target', 'postgresql://target:secret@target.host/db'], {
    migrate: async () => migrationReport('succeeded'),
    stdout: (line) => output.push(line),
    stderr: () => undefined,
  });
  const failed = Object.assign(new Error('migration failed'), { migrationReport: migrationReport('failed') });
  await assert.rejects(
    () => main(['migrate', '--source', 'source.sqlite', '--target', 'postgresql://target:secret@target.host/db'], {
      migrate: async () => { throw failed; },
      stdout: (line) => output.push(line),
      stderr: () => undefined,
    }),
    /migration failed/,
  );
  assert.equal(output.length, 2);
  for (const line of output) {
    assert.match(line, /\[REDACTED_DATABASE_URL\]/);
    for (const component of ['legacy_user', 'legacy_password', 'legacy.host', 'legacy_db', 'error_user', 'error.host', 'error_db']) {
      assert.doesNotMatch(line, new RegExp(component));
    }
  }
});

test('CLI readiness completion emits sanitized reports and maps passed or failed status to exit code', async () => {
  const output: string[] = [];
  const exitCodes: number[] = [];
  for (const status of ['passed', 'failed'] as const) {
    await main(['preflight'], {
      runReadinessCommand: async () => createReport(status),
      stdout: (line) => output.push(line),
      setExitCode: (code) => exitCodes.push(code),
    });
  }
  assert.deepEqual(exitCodes, [0, 1]);
  assert.equal(output.length, 2);
  for (const line of output) {
    assert.match(line, /\[REDACTED_DATABASE_URL\]/);
    assert.doesNotMatch(line, /user|host|secret|\/db/);
  }
});
