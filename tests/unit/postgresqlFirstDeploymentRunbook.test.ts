import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { REQUIRED_RELEASE_CHECKS } from '../../packages/db-migrator/src/commands/release-readiness';
import { shellExecutable } from './postgresLinuxOpsFixtures';

const repoRoot = path.resolve(__dirname, '../..');
const runbookPath = path.join(repoRoot, 'docs', 'runbooks', 'postgresql-first-deployment-cutover.md');
const gitSh = shellExecutable();

function step(document: string, number: number): string {
  const heading = new RegExp(`^## ${number}\\. .+$`, 'm').exec(document);
  assert.ok(heading, `missing step ${number}`);
  const rest = document.slice(heading.index + heading[0].length);
  const next = /^## \d+\. .+$/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

test('first-deployment runbook is an exact, decision-complete 16-step flow', async () => {
  const document = await fs.readFile(runbookPath, 'utf8');
  const headings = [...document.matchAll(/^## (\d+)\. (.+)$/gm)];
  assert.deepEqual(headings.map((match) => Number(match[1])), Array.from({ length: 16 }, (_, index) => index + 1));
  for (let number = 1; number <= 16; number += 1) {
    const body = step(document, number);
    for (const label of ['Inputs', 'Command', 'Success', 'Stop', 'Evidence']) {
      assert.match(body, new RegExp(`\\*\\*${label}\\*\\*`), `step ${number}: ${label}`);
    }
    assert.equal([...body.matchAll(/```sh\r?\n[\s\S]*?\r?\n```/g)].length, 1, `step ${number}: one sh block`);
  }

  const orderedFacts = [
    /a066a4bb1fb9e49e50c742aa08248239f1d9a136[\s\S]*?reviewed tooling HEAD[\s\S]*?runtime image digest[\s\S]*?ops image digest/i,
    /root-controlled[\s\S]*?0700[\s\S]*?0600/i,
    /SAN `postgres`[\s\S]*?verify-full[\s\S]*?pg_stat_ssl\.ssl=true/i,
    /PostgreSQL only[\s\S]*?major 16[\s\S]*?no host database port[\s\S]*?schema `consensus` absent/i,
    /freeze authorization[\s\S]*?freeze receipt[\s\S]*?writers[\s\S]*?stopped/i,
    /must not open live SQLite[\s\S]*?main\/WAL\/SHM[\s\S]*?resource roots/i,
    /operator-controlled transport[\s\S]*?verify-backup/i,
    /production preflight[\s\S]*?no database URL in argv/i,
    /cutover --execute[\s\S]*?exactly once[\s\S]*?no retry[\s\S]*?no drop[\s\S]*?no truncate/i,
    /isolated restore drill[\s\S]*?must not overlap production or source paths/i,
    /app only[\s\S]*?nginx remains stopped[\s\S]*?health[\s\S]*?login[\s\S]*?config[\s\S]*?game[\s\S]*?history[\s\S]*?replay[\s\S]*?memory[\s\S]*?delete/i,
    /TLS[\s\S]*?least privilege[\s\S]*?pool[\s\S]*?timeout[\s\S]*?no-runtime-SQLite/i,
    /pending drafts[\s\S]*?three distinct humans[\s\S]*?go-live owner[\s\S]*?rollback owner[\s\S]*?independent reviewer/i,
    /release-readiness[\s\S]*?exactly 16\/16/i,
    /manual[\s\S]*?start-nginx-gated\.sh[\s\S]*?never transitively/i,
    /at least 60 minutes[\s\S]*?business writes[\s\S]*?new PostgreSQL backup[\s\S]*?isolated restore/i,
  ];
  let cursor = 0;
  for (const expected of orderedFacts) {
    const found = expected.exec(document.slice(cursor));
    assert.ok(found, `missing or out-of-order operational fact: ${expected}`);
    cursor += found.index + found[0].length;
  }
});

test('all runbook sh blocks parse and execute only the controlled safety branch', async () => {
  const document = await fs.readFile(runbookPath, 'utf8');
  const blocks = [...document.matchAll(/```sh\r?\n([\s\S]*?)\r?\n```/g)].map((match) => match[1]);
  assert.equal(blocks.length, 16);
  for (const [index, block] of blocks.entries()) {
    assert.match(block, /^set -eu\r?\n/);
    assert.match(block, /RUN_FIRST_DEPLOYMENT_STEP/);
    const parsed = spawnSync(gitSh, ['-n'], { input: block, encoding: 'utf8' });
    assert.equal(parsed.status, 0, `step ${index + 1} parse: ${parsed.stderr}`);
    const controlled = spawnSync(gitSh, [], {
      input: block,
      encoding: 'utf8',
      env: { ...process.env, RUN_FIRST_DEPLOYMENT_STEP: '0' },
    });
    assert.equal(controlled.status, 0, `step ${index + 1} controlled execution: ${controlled.stderr}`);
  }
});

test('runbook matches real Compose, CLI, traffic gate, and release contracts', async () => {
  const [document, compose, argumentsSource, trafficSource, observationSource] = await Promise.all([
    fs.readFile(runbookPath, 'utf8'),
    fs.readFile(path.join(repoRoot, 'docker-compose.yml'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'packages', 'db-migrator', 'src', 'cli', 'arguments.ts'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'packages', 'db-migrator', 'src', 'release', 'trafficAuthorization.ts'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'packages', 'db-migrator', 'src', 'release', 'observationReceipt.ts'), 'utf8'),
  ]);
  for (const service of ['postgres', 'app', 'nginx', 'migrator']) {
    assert.match(compose, new RegExp(`^  ${service}:`, 'm'));
    assert.match(document, new RegExp(`\\b${service}\\b`), service);
  }
  assert.match(compose, /profiles: \[ops\]/);
  assert.match(compose, /profiles: \[application\]/);
  assert.match(compose, /profiles: \[traffic\]/);
  assert.match(document, /--profile ops[\s\S]*\bmigrator\b/);
  for (const command of [
    'preflight', 'backup', 'verify-backup', 'cutover', 'restore-drill', 'prepare-signoff',
    'release-readiness', 'record-production-build', 'verify-production-build', 'verify-freeze-receipt',
    'verify-traffic-authorization', 'verify-observation-receipt',
  ]) {
    assert.match(argumentsSource, new RegExp(`'${command}'`), command);
    assert.match(document, new RegExp(`\\b${command}\\b`), command);
  }
  for (const check of REQUIRED_RELEASE_CHECKS) assert.match(document, new RegExp(check.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const field of [
    'readinessRunId', 'releaseCandidate', 'toolingHead', 'runtimeImageDigest', 'opsImageDigest',
    'releaseReport', 'buildReceipt', 'freezeReceipt', 'approvals', 'approvedAt', 'expiresAt',
  ]) assert.match(`${document}\n${trafficSource}`, new RegExp(`\\b${field}\\b`), field);
  assert.match(observationSource, /60 \* 60 \* 1000/);
  assert.match(document, /traffic authorization[\s\S]*independent from the release report/i);
  assert.match(document, /observation receipt[\s\S]*independent/i);
});

test('Step 4 executes a real isolated app-role privilege probe and always removes only the probe schema', async () => {
  const document = await fs.readFile(runbookPath, 'utf8');
  const command = /```sh\r?\n([\s\S]*?)\r?\n```/.exec(step(document, 4))?.[1] || '';
  assert.match(command, /rolsuper[\s\S]*rolcreatedb[\s\S]*rolcreaterole[\s\S]*rolinherit[\s\S]*rolreplication[\s\S]*rolbypassrls/);
  assert.match(command, /pg_auth_members[\s\S]*\|0\|f\|t/);
  assert.match(command, /has_database_privilege[\s\S]*CREATE/);
  assert.match(command, /pg_stat_ssl[\s\S]*pg_backend_pid/);
  assert.match(command, /CREATE SCHEMA consensus_privilege_probe/);
  assert.match(command, /CREATE TABLE consensus_privilege_probe/);
  assert.match(command, /CREATE SEQUENCE consensus_privilege_probe/);
  assert.match(command, /consensus_app[\s\S]*INSERT[\s\S]*nextval/);
  assert.match(command, /permission denied for schema consensus_privilege_probe/);
  assert.match(command, /trap[\s\S]*DROP SCHEMA IF EXISTS consensus_privilege_probe CASCADE/);
  assert.match(command, /pg_namespace[\s\S]*nspname=[^\n]*consensus/);
  for (const [signal, code] of [['HUP', 129], ['INT', 130], ['TERM', 143]] as const) {
    assert.match(command, new RegExp(`trap 'cleanup ${code}' ${signal}`));
  }
  const signalContract = /cleanup\(\) \{[\s\S]*?trap 'cleanup 143' TERM/.exec(command)?.[0] || '';
  const terminated = spawnSync(gitSh, [], {
    input: `set -eu\nmigrator(){ :; }\n${signalContract}\nkill -TERM $$\nexit 0\n`,
    encoding: 'utf8',
  });
  assert.equal(terminated.status === 143 || terminated.status === 36608 || terminated.signal === 'SIGTERM', true);
});

test('runbook builds a066 through an exact named context and binds typed content provenance', async () => {
  const document = await fs.readFile(runbookPath, 'utf8');
  assert.match(document, /a066a4bb1fb9e49e50c742aa08248239f1d9a136[^\n]*approved application baseline/i);
  assert.match(step(document, 1), /independent detached checkout[\s\S]*exactly `a066/i);
  assert.match(step(document, 2), /named `application_source` context[\s\S]*embedded[\s\S]*manifest/i);
  assert.match(step(document, 2), /record-production-build --execute[\s\S]*atomically creates[\s\S]*never overwrites/i);
  assert.match(step(document, 2), /consensus-production_consensus-postgres-data/);
  assert.match(document, /three distinct humans[\s\S]*reviewed tooling overlay[\s\S]*runtime image digest[\s\S]*ops image digest/i);
  assert.match(step(document, 5), /verify-freeze-receipt[\s\S]*freeze receipt SHA-256/i);
  assert.match(step(document, 14), /freezeReceipt \{path,sizeBytes,sha256\}/);
  assert.match(step(document, 14), /buildReceipt \{path,sizeBytes,sha256\}[\s\S]*candidateTree[\s\S]*applicationInputManifest/);
  assert.match(step(document, 15), /nginx-only Compose transcript[\s\S]*traffic openedAt/i);
  assert.match(step(document, 16), /startedAt[\s\S]*not before[\s\S]*traffic authorization approvedAt/i);
  for (const block of document.matchAll(/```sh\r?\n([\s\S]*?)\r?\n```/g)) {
    assert.doesNotMatch(block[1], /^\.\/scripts\/ops\/postgres\/.+\.sh$/m);
  }
});

test('transfer omits unused freeze exports and production preflight is self-contained', async () => {
  const document = await fs.readFile(runbookPath, 'utf8');
  const transferCommand = /```sh\r?\n([\s\S]*?)\r?\n```/.exec(step(document, 7))?.[1] || '';
  assert.doesNotMatch(transferCommand, /export (?:FREEZE_|SOURCE_SQLITE|RESOURCE_RELATIVE|GO_LIVE_OWNER)/);
  const preflightCommand = /```sh\r?\n([\s\S]*?)\r?\n```/.exec(step(document, 8))?.[1] || '';
  for (const name of [
    'FREEZE_RECEIPT_RELATIVE_PATH', 'FREEZE_RECEIPT_SHA256', 'FREEZE_ID',
    'SOURCE_SQLITE_RELATIVE_PATH', 'RESOURCE_RELATIVE_PATHS', 'GO_LIVE_OWNER',
    'APPLICATION_SOURCE_ROOT', 'BUILD_RECEIPT_RELATIVE_PATH', 'BUILD_RECEIPT_SHA256', 'BUILD_RECEIPT_SIZE_BYTES',
  ]) assert.match(preflightCommand, new RegExp(`export ${name}=`), name);
});

test('first-deployment evidence gaps are explicit fail-closed stop conditions', async () => {
  const document = await fs.readFile(runbookPath, 'utf8');
  assert.match(step(document, 5), /missing\/invalid\/stale receipt[\s\S]*writer not stopped/i);
  assert.match(step(document, 8), /missing freeze\/TLS\/least-privilege\/authorization evidence/i);
  assert.match(step(document, 10), /restore[\s\S]*hash mismatch[\s\S]*nonzero command/i);
  assert.match(step(document, 13), /duplicate identity[\s\S]*missing raw evidence[\s\S]*restore\/TLS\/least-privilege proof/i);
  assert.match(step(document, 14), /missing\/failed\/stale[\s\S]*not exactly 16[\s\S]*three-human evidence/i);
  assert.match(step(document, 16), /under 60 minutes[\s\S]*missing metric[\s\S]*restore failure/i);
});

test('rollback decisions fail closed on PostgreSQL business writes and preserve every failure site', async () => {
  const [document, rollback] = await Promise.all([
    fs.readFile(runbookPath, 'utf8'),
    fs.readFile(path.join(repoRoot, 'docs', 'runbooks', 'postgresql-rollback.md'), 'utf8'),
  ]);
  const truth = `${document}\n${rollback}`;
  assert.match(truth, /before traffic[\s\S]*preserve[\s\S]*new run ID[\s\S]*new absent target schema/i);
  assert.match(truth, /after traffic[\s\S]*before any new PostgreSQL business write[\s\S]*separately bound rollback receipt/i);
  assert.match(truth, /after any new PostgreSQL business write[\s\S]*SQLite rollback (?:is )?forbidden[\s\S]*forward repair[\s\S]*data reconciliation/i);
  assert.match(truth, /never[\s\S]*dual write[\s\S]*automatic PG-to-SQLite[\s\S]*automatic cleanup/i);
  const shell = [...document.matchAll(/```sh\r?\n([\s\S]*?)\r?\n```/g)].map((match) => match[1]).join('\n');
  assert.doesNotMatch(shell, /docker compose down|rm\s+-r|DROP\s+SCHEMA\s+(?:IF\s+EXISTS\s+)?consensus(?:\s|;)|TRUNCATE/i);
});
