import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { buildManifest, hashFile } from '../../packages/db-migrator/src/backup/manifest';
import type { ReadinessReport } from '../../packages/db-migrator/src/reporting/reportTypes';

const repoRoot = path.resolve(__dirname, '../..');
const composeFile = path.join(repoRoot, 'docker-compose.yml');
const releaseCandidate = '1234567890abcdef1234567890abcdef12345678';
const freezeReceiptSha256 = 'f'.repeat(64);

function run(command: string, args: string[], env: NodeJS.ProcessEnv, timeout = 120_000) {
  return spawnSync(command, args, { cwd: repoRoot, env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 });
}

function mustRun(command: string, args: string[], env: NodeJS.ProcessEnv, timeout?: number): string {
  const result = run(command, args, env, timeout);
  assert.equal(result.error, undefined, `${command} could not start`);
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function lastJson(output: string): Record<string, unknown> {
  const line = output.split(/\r?\n/).reverse().find((entry) => entry.trim().startsWith('{'));
  assert.ok(line, `expected JSON output:\n${output}`);
  return JSON.parse(line) as Record<string, unknown>;
}

function createSource(candidate: string, invalid = false): void {
  const sqlite = new Database(candidate);
  if (invalid) {
    sqlite.exec(`CREATE TABLE skins (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, source TEXT NOT NULL,
      terms_json TEXT NOT NULL, background TEXT NOT NULL, truth TEXT NOT NULL,
      clues_json TEXT NOT NULL, noises_json TEXT NOT NULL, memory_examples_json TEXT NOT NULL,
      enabled INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    const insert = sqlite.prepare('INSERT INTO skins VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const timestamp = '2026-08-11T00:00:00.000Z';
    insert.run('valid-first', 'Valid', 'v1', 'test', '{}', '', '', '[]', '[]', '[]', 1, timestamp, timestamp);
    insert.run('invalid-second', 'Invalid', 'v1', 'test', '{broken', '', '', '[]', '[]', '[]', 1, timestamp, timestamp);
  } else {
    sqlite.exec(`
      CREATE TABLE admin_users (id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT, display_name TEXT,
        enabled INTEGER, must_change_password INTEGER, created_at TEXT, updated_at TEXT);
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT, updated_at TEXT);
      CREATE TABLE players (id INTEGER PRIMARY KEY, nickname TEXT, name TEXT, avatar TEXT, sex TEXT,
        personality TEXT, provider TEXT, model TEXT, model_id INTEGER, fallback_model_id INTEGER,
        voice_package_id INTEGER, temperature REAL, enabled INTEGER, sort_order INTEGER,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE games (id TEXT PRIMARY KEY, game_type TEXT, mode TEXT, skin_id TEXT, skin_name TEXT,
        winner TEXT, win_reason TEXT, topic_json TEXT, players_json TEXT, rounds_json TEXT,
        event_json TEXT, audio_resources_json TEXT, created_at TEXT);
      CREATE TABLE game_playback_events (game_id TEXT, sequence INTEGER, protocol_version INTEGER,
        event_type TEXT, view_mode TEXT, payload_json TEXT, media_json TEXT, created_at TEXT,
        PRIMARY KEY (game_id, sequence));
      CREATE TABLE player_game_memories (id INTEGER PRIMARY KEY, game_type TEXT, owner_player_id INTEGER,
        subject_player_id INTEGER, games_played INTEGER, familiarity_score REAL, traits_json TEXT,
        recent_summary TEXT, created_at TEXT, updated_at TEXT);
    `);
  }
  sqlite.close();
}

async function prepareCutoverInput(root: string, runId: string, invalid = false): Promise<void> {
  const input = path.join(root, runId);
  const backup = path.join(input, 'backup');
  await fs.mkdir(path.join(backup, 'sqlite-raw'), { recursive: true });
  const source = path.join(backup, 'sqlite-consistent.sqlite');
  createSource(source, invalid);
  await fs.copyFile(source, path.join(backup, 'sqlite-raw', 'source.sqlite'));
  const manifestPath = path.join(backup, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(await buildManifest(backup, `backup-${runId}`), null, 2)}\n`);
  const now = Date.now();
  const authorization = {
    version: 1, purpose: 'production-cutover', status: 'approved', approved: true,
    releaseCandidate, cutoverRunId: runId,
    backupManifestSha256: await hashFile(manifestPath), sourceSnapshotSha256: await hashFile(source),
    freezeReceiptSha256,
    target: {
      database: 'consensus', schema: 'consensus', role: 'consensus_migrator',
      host: 'postgres', port: 5432, tlsMode: 'verify-full',
    },
    maintenanceWindow: {
      startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 600_000).toISOString(),
    },
    approvals: [
      { role: 'go-live-owner', name: 'TLS Cutover Owner', approvedAt: new Date(now - 120_000).toISOString() },
      { role: 'rollback-owner', name: 'TLS Rollback Owner', approvedAt: new Date(now - 119_000).toISOString() },
      { role: 'independent-reviewer', name: 'TLS Independent Reviewer', approvedAt: new Date(now - 118_000).toISOString() },
    ],
  };
  await fs.writeFile(path.join(input, 'authorization.json'), `${JSON.stringify(authorization, null, 2)}\n`);
  await fs.mkdir(path.join(input, 'evidence'));
}

test('compiled production cutover executes against unique PostgreSQL 16 TLS and closes every safety boundary', { timeout: 1_200_000 }, async () => {
  const suffix = randomBytes(6).toString('hex');
  const project = `consensus_cutover_${suffix}`;
  const image = `${project}-migrator`;
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), `${project}-`));
  const tls = path.join(temporary, 'tls');
  const override = path.join(temporary, 'compose.override.yml');
  const secrets = ['bootstrap', 'app', 'migrator'].map((name) => path.join(temporary, `${name}-password`));
  const environment = {
    ...process.env,
    POSTGRES_BOOTSTRAP_PASSWORD_FILE: secrets[0],
    POSTGRES_APP_PASSWORD_FILE: secrets[1],
    POSTGRES_MIGRATOR_PASSWORD_FILE: secrets[2],
    POSTGRES_TLS_SOURCE_DIR: tls,
    POSTGRES_CA_FILE: path.join(tls, 'ca.crt'),
  };
  const composeArgs = ['--project-name', project, '-f', composeFile, '-f', override];
  const compose = (args: string[], timeout?: number) => run('docker', ['compose', ...composeArgs, ...args], environment, timeout);
  const composeMust = (args: string[], timeout?: number) => mustRun('docker', ['compose', ...composeArgs, ...args], environment, timeout);
  const runId = 'compiled-production-cutover';
  const failedRunId = 'compiled-production-rollback';

  try {
    await fs.mkdir(tls);
    await Promise.all(secrets.map((candidate) => fs.writeFile(candidate, `${randomBytes(24).toString('base64url')}:@/%\n`)));
    mustRun('docker', ['run', '--rm', '--entrypoint', 'sh', '-v', `${tls}:/work`, 'alpine/openssl', '-c', [
      "openssl req -x509 -newkey rsa:2048 -nodes -keyout /work/ca.key -out /work/ca.crt -subj '/CN=Cutover test CA' -days 1",
      "openssl req -newkey rsa:2048 -nodes -keyout /work/server.key -out /work/server.csr -subj '/CN=postgres' -addext 'subjectAltName=DNS:postgres'",
      'openssl x509 -req -in /work/server.csr -CA /work/ca.crt -CAkey /work/ca.key -CAcreateserial -out /work/server.crt -days 1 -copy_extensions copy',
    ].join(' && ')], environment);
    await fs.writeFile(override, `services:\n  migrator:\n    image: ${image}\n`);
    await prepareCutoverInput(temporary, failedRunId, true);
    await prepareCutoverInput(temporary, runId);
    await fs.writeFile(path.join(temporary, 'lock-probe.cjs'), `
const fs = require('node:fs');
const { openCutoverTargetSession } = require('/app/packages/db-migrator/dist/cutover/targetSession.js');
const password = fs.readFileSync('/run/secrets/postgres_migrator_password', 'utf8').trim();
const targetUrl = 'postgresql://consensus_migrator:' + encodeURIComponent(password) + '@postgres:5432/consensus';
(async () => {
  if (process.argv[2] === 'unsafe') {
    try { await openCutoverTargetSession({ targetUrl, tlsMode: 'verify-full', caPath: process.env.DATABASE_CA_PATH }); }
    catch (error) { console.log(JSON.stringify({ code: error.code })); return; }
    throw new Error('unsafe target opened');
  }
  const first = await openCutoverTargetSession({ targetUrl, tlsMode: 'verify-full', caPath: process.env.DATABASE_CA_PATH });
  let secondCode = '';
  try { await openCutoverTargetSession({ targetUrl, tlsMode: 'verify-full', caPath: process.env.DATABASE_CA_PATH }); }
  catch (error) { secondCode = error.code; }
  await first.release();
  console.log(JSON.stringify({ firstRunId: 'run-a', secondRunId: 'run-b', secondCode }));
})().catch(() => process.exit(1));
`);

    composeMust(['--profile', 'ops', 'build', 'migrator'], 900_000);
    composeMust(['up', '-d', '--wait', '--wait-timeout', '90', 'postgres'], 180_000);
    const probeArgs = ['--profile', 'ops', 'run', '--rm', '--no-deps', '--entrypoint', 'node',
      '-v', `${temporary}:/cutover`, 'migrator', '/cutover/lock-probe.cjs'];
    const contention = lastJson(composeMust([...probeArgs, 'contention']));
    assert.deepEqual(contention, { firstRunId: 'run-a', secondRunId: 'run-b', secondCode: 'CUTOVER_ALREADY_RUNNING' });

    const execute = (id: string) => compose([
      '--profile', 'ops', 'run', '--rm', '--no-deps', '-e', `RELEASE_CANDIDATE_SHA=${releaseCandidate}`,
      '-v', `${temporary}:/cutover`, 'migrator', 'cutover',
      '--source-snapshot', `/cutover/${id}/backup/sqlite-consistent.sqlite`, '--manifest', `/cutover/${id}/backup/manifest.json`,
      '--authorization', `/cutover/${id}/authorization.json`, '--output', `/cutover/${id}/evidence`,
      '--freeze-receipt-sha256', freezeReceiptSha256,
      '--run-id', id, '--execute',
    ], 300_000);

    const failed = execute(failedRunId);
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
    const failedReport = lastJson(failed.stdout) as unknown as ReadinessReport;
    assert.equal(failedReport.status, 'failed', `${failed.stdout}\n${failed.stderr}`);
    assert.equal(failedReport.artifacts.some((artifact) => artifact.type === 'completion-receipt'), false);
    const schemaAfterFailure = composeMust(['exec', '-T', 'postgres', 'psql', '-U', 'consensus_bootstrap', '-d', 'consensus', '-Atc',
      "SELECT (to_regnamespace('consensus') IS NOT NULL)::text"]);
    assert.equal(schemaAfterFailure, 'true', JSON.stringify(failedReport));
    const rollbackCounts = composeMust(['exec', '-T', 'postgres', 'psql', '-U', 'consensus_bootstrap', '-d', 'consensus', '-Atc',
      'SELECT (SELECT COUNT(*) FROM consensus.skins)::text || \'|\' || (SELECT COUNT(*) FROM consensus.model_providers)::text']);
    assert.equal(rollbackCounts, '0|0');
    composeMust(['exec', '-T', 'postgres', 'psql', '-U', 'consensus_bootstrap', '-d', 'consensus', '-c', 'DROP SCHEMA consensus CASCADE']);

    const succeeded = execute(runId);
    assert.equal(succeeded.status, 0, succeeded.stdout + succeeded.stderr);
    const report = lastJson(succeeded.stdout) as unknown as ReadinessReport;
    assert.equal(report.status, 'passed');
    assert.ok(report.artifacts.some((artifact) => artifact.type === 'completion-receipt'));
    const validation = JSON.parse(await fs.readFile(path.join(temporary, runId, 'evidence', `${runId}-validation.json`), 'utf8')) as ReadinessReport;
    const smoke = JSON.parse(await fs.readFile(path.join(temporary, runId, 'evidence', `${runId}-smoke.json`), 'utf8')) as ReadinessReport;
    assert.equal(validation.schema, 'consensus');
    assert.equal(validation.status, 'passed');
    assert.equal(smoke.schema, 'consensus');
    assert.equal(smoke.status, 'passed');
    assert.equal(smoke.checks.find((check) => check.id === 'teardown.synthetic-fixtures-removed')?.status, 'passed');
    for (const table of ['players', 'player_game_memories', 'games', 'admin_users']) {
      const count = composeMust(['exec', '-T', 'postgres', 'psql', '-U', 'consensus_bootstrap', '-d', 'consensus', '-Atc',
        `SELECT COUNT(*) FROM consensus.${table}`]);
      assert.equal(count, '0', table);
    }
    const canonical = Number(composeMust(['exec', '-T', 'postgres', 'psql', '-U', 'consensus_bootstrap', '-d', 'consensus', '-Atc',
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='consensus'"]));
    assert.ok(canonical > 20);
    assert.deepEqual(lastJson(composeMust([...probeArgs, 'unsafe'])), { code: 'CUTOVER_TARGET_UNSAFE' });
    mustRun('docker', ['run', '--rm', '--entrypoint', 'sh', image, '-c', "test -z \"$(find /app/packages/server/dist -name '*.ts' -print -quit)\""], environment);
  } finally {
    compose(['--profile', 'ops', 'down', '--volumes', '--remove-orphans'], 180_000);
    run('docker', ['image', 'rm', '-f', image], environment);
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
