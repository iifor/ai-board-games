import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '../..');
const scriptsRoot = path.join(repoRoot, 'scripts', 'ops', 'postgres');

const cases = [
  {
    name: 'preflight',
    args: ['-Source', 'source.sqlite', '-Output', 'out', '-Resources', 'resources', '-RequireTls', 'true', '-RunId', 'preflight-1'],
    expected: ['--filter', '@ai-presenter/db-migrator', 'run', 'preflight', '--', '--source', 'source.sqlite', '--output', 'out', '--resources', 'resources', '--require-tls', 'true', '--run-id', 'preflight-1'],
  },
  {
    name: 'backup',
    args: ['-Source', 'source.sqlite', '-Output', 'out', '-Resources', 'resources', '-RunId', 'backup-1', '-Execute'],
    expected: ['--filter', '@ai-presenter/db-migrator', 'run', 'backup', '--', '--source', 'source.sqlite', '--output', 'out', '--resources', 'resources', '--run-id', 'backup-1', '--execute'],
  },
  {
    name: 'rehearse',
    args: ['-SourceSnapshot', 'snapshot.sqlite', '-Manifest', 'manifest.json', '-Output', 'out', '-RunId', 'rehearsal-1', '-Execute'],
    expected: ['--filter', '@ai-presenter/db-migrator', 'run', 'rehearse', '--', '--source-snapshot', 'snapshot.sqlite', '--manifest', 'manifest.json', '--output', 'out', '--run-id', 'rehearsal-1', '--execute'],
  },
  {
    name: 'validate',
    args: ['-SourceSnapshot', 'snapshot.sqlite', '-Manifest', 'manifest.json', '-MigrationReport', 'migration.json', '-Schema', 'schema_a', '-Output', 'out', '-RunId', 'validation-1'],
    expected: ['--filter', '@ai-presenter/db-migrator', 'run', 'validate', '--', '--source-snapshot', 'snapshot.sqlite', '--manifest', 'manifest.json', '--migration-report', 'migration.json', '--schema', 'schema_a', '--output', 'out', '--run-id', 'validation-1'],
  },
  {
    name: 'release-readiness',
    args: ['-Reports', 'a.json,b.json', '-OperatorSignoff', 'signoff.json', '-ReleaseCandidate', '0123456789abcdef0123456789abcdef01234567', '-Output', 'out', '-RunId', 'release-1'],
    expected: ['--filter', '@ai-presenter/db-migrator', 'run', 'release-readiness', '--', '--reports', 'a.json,b.json', '--operator-signoff', 'signoff.json', '--release-candidate', '0123456789abcdef0123456789abcdef01234567', '--output', 'out', '--run-id', 'release-1'],
  },
] as const;

test('PostgreSQL operations scripts are typed, thin, and contain no database implementation', async () => {
  for (const entry of cases) {
    const source = await fs.readFile(path.join(scriptsRoot, `${entry.name}.ps1`), 'utf8');
    assert.match(source, /\[CmdletBinding\(\)\]/, entry.name);
    assert.match(source, /param\s*\(/, entry.name);
    assert.match(source, /\[(?:string|bool|switch)\]\s*\$[A-Za-z]+/, entry.name);
    assert.match(source, /\$PSScriptRoot/, entry.name);
    assert.doesNotMatch(source, /\bpsql\b|DROP\s+SCHEMA|\bVACUUM\b|\bcheckpoint\b|postgres(?:ql)?:\/\/|\bpassword\b/i, entry.name);
    if (entry.name === 'release-readiness') assert.doesNotMatch(source, /\$Execute|--execute/i);
    if (entry.name === 'preflight' || entry.name === 'validate') {
      assert.doesNotMatch(source, /\$Target|--target/i, entry.name);
      assert.match(source, /DATABASE_URL/, entry.name);
    }
  }
});

test('PostgreSQL operations scripts forward exact CLI arguments and child exit codes', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'postgres-ops-scripts-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const stub = path.join(temporary, 'pnpm.cmd');
  await fs.writeFile(stub, '@echo off\r\necho %* > "%OPS_CAPTURE%"\r\nexit /b %OPS_EXIT%\r\n');

  for (const entry of cases) {
    const capture = path.join(temporary, `${entry.name}.txt`);
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptsRoot, `${entry.name}.ps1`), ...entry.args],
      {
        cwd: temporary,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${temporary}${path.delimiter}${process.env.PATH || ''}`,
          OPS_CAPTURE: capture,
          OPS_EXIT: '23',
          DATABASE_URL: 'postgres://not-forwarded@host/rehearsal_test',
        },
      },
    );
    assert.equal(result.status, 23, `${entry.name}: ${result.stderr}`);
    const actual = (await fs.readFile(capture, 'utf8')).trim().split(/\s+/);
    assert.deepEqual(actual, entry.expected, entry.name);
  }
});

test('PostgreSQL operations scripts fail when pnpm.cmd cannot be started', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'postgres-ops-missing-command-'));
  const emptyPath = path.join(temporary, 'empty-path');
  await fs.mkdir(emptyPath);
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

  for (const entry of cases) {
    const result = spawnSync(
      powershell,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptsRoot, `${entry.name}.ps1`), ...entry.args],
      { cwd: temporary, encoding: 'utf8', env: { ...process.env, PATH: emptyPath } },
    );
    assert.notEqual(result.status, 0, `${entry.name} must fail when pnpm.cmd is unavailable`);
  }
});
