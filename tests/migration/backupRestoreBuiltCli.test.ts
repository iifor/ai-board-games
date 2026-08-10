import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createBackupFixture } from './backupRestoreFixture';

const repoRoot = path.resolve(__dirname, '../..');
const builtCli = path.join(repoRoot, 'packages', 'db-migrator', 'dist', 'cli.js');

test('built Node CLI verifies and restores a 296+ character path that the old PowerShell hash flow cannot read', async (t) => {
  const fixture = await createBackupFixture(t);
  const longPath = path.join(fixture.root, ...fixture.longRelativePath.split('/'));
  assert.ok(longPath.length >= 296);
  if (process.platform === 'win32') {
    const escaped = longPath.replace(/'/g, "''");
    const legacy = spawnSync('powershell.exe', [
      '-NoProfile', '-Command', `$ErrorActionPreference='Stop'; (Get-FileHash -LiteralPath '${escaped}' -Algorithm SHA256).Hash`,
    ], { encoding: 'utf8' });
    assert.notEqual(legacy.status, 0, 'the fixture must reproduce the superseded PowerShell long-path failure');
  }

  const build = spawnSync(process.env.ComSpec || 'cmd.exe', [
    '/d', '/s', '/c', 'pnpm.cmd --filter @ai-presenter/db-migrator build',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const malformedMap = path.join(fixture.temporary, 'malformed-map.json');
  await fs.writeFile(malformedMap, '{not-json');
  const rejectedMap = spawnSync(process.execPath, [
    builtCli,
    'restore-drill',
    '--backup', fixture.root,
    '--manifest', fixture.manifestPath,
    '--resource-map', malformedMap,
    '--restore-output', path.join(fixture.output, 'bad'),
    '--output', fixture.output,
    '--run-id', 'built-invalid-map',
    '--execute',
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(rejectedMap.status, 1);
  const failedMapReport = JSON.parse(await fs.readFile(path.join(fixture.output, 'built-invalid-map-backup.json'), 'utf8'));
  assert.equal(failedMapReport.errors[0].code, 'RESTORE_MAP_INVALID');
  assert.doesNotMatch(JSON.stringify(failedMapReport), /malformed-map|backup-restore-commands/i);

  const verify = spawnSync(process.execPath, [
    builtCli,
    'verify-backup',
    '--backup', fixture.root,
    '--manifest', fixture.manifestPath,
    '--output', fixture.output,
    '--run-id', 'built-verify',
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(verify.status, 0, verify.stderr || verify.stdout);
  assert.equal(JSON.parse(verify.stdout.trim()).status, 'passed');

  const resourceMapPath = path.join(fixture.temporary, 'resource-map.json');
  await fs.writeFile(resourceMapPath, JSON.stringify({
    version: 1,
    resources: [
      { sourceIndex: 0, destination: 'resources-a' },
      { sourceIndex: 1, destination: 'resources-b' },
    ],
  }));
  const restore = spawnSync(process.execPath, [
    builtCli,
    'restore-drill',
    '--backup', fixture.root,
    '--manifest', fixture.manifestPath,
    '--resource-map', resourceMapPath,
    '--restore-output', path.join(fixture.output, 'r'),
    '--output', fixture.output,
    '--run-id', 'built-restore',
    '--execute',
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(restore.status, 0, restore.stderr || restore.stdout);
  assert.equal(JSON.parse(restore.stdout.trim()).status, 'passed');
});
