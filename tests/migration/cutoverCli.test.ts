import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { main } from '../../packages/db-migrator/src/cli';
import { buildManifest } from '../../packages/db-migrator/src/backup/manifest';
import type { ReadinessReport } from '../../packages/db-migrator/src/reporting/reportTypes';

test('cutover CLI dispatch and orchestration stay within backend module size boundaries', () => {
  const root = path.resolve(__dirname, '../..');
  for (const relative of [
    'packages/db-migrator/src/cli.ts',
    'packages/db-migrator/src/commands/cutover.ts',
  ]) {
    const lines = fs.readFileSync(path.join(root, relative), 'utf8').split(/\r?\n/).length;
    assert.ok(lines <= 250, `${relative} has ${lines} lines`);
  }
});

test('cutover tests do not persist complete credential-bearing PostgreSQL URLs', () => {
  const root = path.resolve(__dirname, '../..');
  const testDirectories = ['tests/migration', 'tests/postgres'];
  const credentialUrl = /postgres(?:ql)?:\/\/[^\s'"`$/:]+:[^@\s'"`$]+@[^\s'"`$]+/;
  const offenders = testDirectories.flatMap((relative) => fs.readdirSync(path.join(root, relative))
    .filter((file) => /^cutover.*\.test\.ts$/.test(file))
    .filter((file) => credentialUrl.test(fs.readFileSync(path.join(root, relative, file), 'utf8')))
    .map((file) => `${relative}/${file}`));
  assert.deepEqual(offenders, []);
});

function dryReport(runId: string): ReadinessReport {
  return {
    runId, schema: 'consensus', stage: 'cutover', status: 'passed',
    startedAt: '2026-08-11T00:00:00.000Z', finishedAt: '2026-08-11T00:00:00.000Z', durationMs: 0,
    checks: [{ id: 'execution', status: 'skipped', message: 'Dry-run made no changes' }],
    artifacts: [], errors: [],
  };
}

function runtimeCredentialUrl(host: string): string {
  const target = new URL(`postgresql://${host}:6543/consensus`);
  target.username = `test_${randomBytes(8).toString('hex')}`;
  target.password = randomBytes(16).toString('base64url');
  return target.toString();
}

test('cutover rejects literal target before command, file, database, or output access', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cutover-target-'));
  const output = path.join(root, 'must-not-exist');
  let invoked = false;
  try {
    await assert.rejects(main([
      'cutover', '--source-snapshot', path.join(root, 'missing.sqlite'), '--manifest', path.join(root, 'missing.json'),
      '--target', runtimeCredentialUrl('192.0.2.10'),
      '--output', output, '--run-id', 'forbidden-target', '--execute',
    ], {
      runReadinessCommand: async () => { invoked = true; return dryReport('forbidden-target'); },
      stdout: () => assert.fail('must not write stdout'), stderr: () => assert.fail('must not write stderr'),
      setExitCode: () => assert.fail('must not set an exit code'),
    }), (error: unknown) => {
      const failure = error as Error & { code?: string };
      assert.equal(failure.code, 'CUTOVER_TARGET_ARG_FORBIDDEN');
      assert.doesNotMatch(failure.message, /private_user|private_password|192\.0\.2\.10|6543|postgres(?:ql)?:\/\//i);
      return true;
    });
    assert.equal(invoked, false);
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cutover rejects every operator-supplied production identity option before I/O', async () => {
  for (const option of ['schema', 'database', 'role', 'host', 'port']) {
    let invoked = false;
    await assert.rejects(main([
      'cutover', '--source-snapshot', 'missing.sqlite', '--manifest', 'missing.json',
      `--${option}`, 'operator-value', '--output', 'must-not-exist', '--run-id', 'fixed-identity',
    ], {
      runReadinessCommand: async () => { invoked = true; return dryReport('fixed-identity'); },
      stdout: () => assert.fail('must not write stdout'), stderr: () => assert.fail('must not write stderr'),
      setExitCode: () => assert.fail('must not set exit code'),
    }), (error: unknown) => (error as { code?: string }).code === 'CUTOVER_FIXED_OPTION_FORBIDDEN');
    assert.equal(invoked, false, option);
  }
});

test('cutover dry-run dispatches without authorization and emits one sanitized in-memory report', async () => {
  const stdout: string[] = [];
  const exitCodes: number[] = [];
  const output = path.join(os.tmpdir(), `cutover-dry-output-${process.pid}-${Date.now()}`);
  await main([
    'cutover', '--source-snapshot', 'consistent.sqlite', '--manifest', 'manifest.json',
    '--output', output, '--run-id', 'dry-run',
  ], {
    runReadinessCommand: async (command, parsed) => {
      assert.equal(command, 'cutover');
      assert.equal(parsed.execute, false);
      assert.equal(parsed.values.has('authorization'), false);
      return dryReport('dry-run');
    },
    stdout: (line) => stdout.push(line), stderr: () => assert.fail('dry-run must not write stderr'),
    setExitCode: (code) => exitCodes.push(code),
  });
  assert.deepEqual(exitCodes, [0]);
  assert.equal(stdout.length, 1);
  assert.equal(JSON.parse(stdout[0]).stage, 'cutover');
  assert.equal(fs.existsSync(output), false);
});

test('cutover execute without authorization fails before command, database, or output access', async () => {
  const output = path.join(os.tmpdir(), `cutover-auth-output-${process.pid}-${Date.now()}`);
  let invoked = false;
  await assert.rejects(main([
    'cutover', '--source-snapshot', 'missing.sqlite', '--manifest', 'missing.json',
    '--output', output, '--run-id', 'missing-auth', '--execute',
  ], {
    runReadinessCommand: async () => { invoked = true; return dryReport('missing-auth'); },
    stdout: () => assert.fail('must not write stdout'), stderr: () => assert.fail('must not write stderr'),
    setExitCode: () => assert.fail('must not set an exit code'),
  }), (error: unknown) => (error as { code?: string }).code === 'CUTOVER_AUTHORIZATION_REQUIRED');
  assert.equal(invoked, false);
  assert.equal(fs.existsSync(output), false);
});

test('cutover execute without freeze receipt hash fails before command or output access', async () => {
  let invoked = false;
  await assert.rejects(main([
    'cutover', '--source-snapshot', 'missing.sqlite', '--manifest', 'missing.json',
    '--authorization', 'authorization.json', '--output', 'must-not-exist', '--run-id', 'missing-freeze', '--execute',
  ], {
    runReadinessCommand: async () => { invoked = true; return dryReport('missing-freeze'); },
    stdout: () => assert.fail('must not write stdout'), stderr: () => assert.fail('must not write stderr'),
    setExitCode: () => assert.fail('must not set exit code'),
  }), (error: unknown) => (error as { code?: string }).code === 'CUTOVER_FREEZE_RECEIPT_REQUIRED');
  assert.equal(invoked, false);
});

test('built-in cutover CLI routes a verified dry-run without environment or output writes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cutover-built-in-'));
  const backup = path.join(root, 'backup');
  const source = path.join(backup, 'sqlite-consistent.sqlite');
  const manifestPath = path.join(backup, 'manifest.json');
  const output = path.join(root, 'evidence');
  const stdout: string[] = [];
  const exitCodes: number[] = [];
  try {
    fs.mkdirSync(path.join(backup, 'sqlite-raw'), { recursive: true });
    fs.writeFileSync(source, 'consistent');
    fs.writeFileSync(path.join(backup, 'sqlite-raw', 'source.sqlite'), 'raw');
    fs.writeFileSync(manifestPath, `${JSON.stringify(await buildManifest(backup, 'backup-run'), null, 2)}\n`);
    await main([
      'cutover', '--source-snapshot', source, '--manifest', manifestPath,
      '--output', output, '--run-id', 'built-in-dry',
    ], {
      stdout: (line) => stdout.push(line), stderr: () => assert.fail('must not write stderr'),
      setExitCode: (code) => exitCodes.push(code),
    });
    assert.deepEqual(exitCodes, [0]);
    assert.equal(JSON.parse(stdout[0]).stage, 'cutover');
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('compiled db-migrator dist runs cutover dry-run without loading server TypeScript', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cutover-dist-'));
  const backup = path.join(root, 'backup');
  const source = path.join(backup, 'sqlite-consistent.sqlite');
  const manifestPath = path.join(backup, 'manifest.json');
  const output = path.join(root, 'evidence');
  const repoRoot = path.resolve(__dirname, '../..');
  try {
    fs.mkdirSync(path.join(backup, 'sqlite-raw'), { recursive: true });
    fs.writeFileSync(source, 'consistent');
    fs.writeFileSync(path.join(backup, 'sqlite-raw', 'source.sqlite'), 'raw');
    fs.writeFileSync(manifestPath, `${JSON.stringify(await buildManifest(backup, 'backup-run'), null, 2)}\n`);
    const build = spawnSync(process.env.ComSpec || 'cmd.exe', [
      '/d', '/s', '/c', 'pnpm.cmd --filter @ai-presenter/db-migrator run build',
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const run = spawnSync(process.execPath, [
      path.join(repoRoot, 'packages/db-migrator/dist/cli.js'), 'cutover',
      '--source-snapshot', source, '--manifest', manifestPath,
      '--output', output, '--run-id', 'compiled-dry-run',
    ], { cwd: repoRoot, encoding: 'utf8', env: {} });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const report = JSON.parse(run.stdout.trim()) as ReadinessReport;
    assert.equal(report.stage, 'cutover');
    assert.equal(report.status, 'passed');
    assert.equal(fs.existsSync(output), false);
    assert.doesNotMatch(run.stdout + run.stderr, /packages[\\/]server[\\/].*\.ts|postgres(?:ql)?:\/\//i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
