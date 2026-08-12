import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  candidateTree, fixture, fixedCompose, opsDigest, regexEscape, releaseCandidate, repoRoot, run, runtimeDigest,
  scriptsRoot, toolingHead,
} from './postgresLinuxOpsFixtures';

test('nginx validates signed evidence and current image provenance before starting nginx only', async (t) => {
  const fx = await fixture(t);
  const denied = run('start-nginx-gated.sh', { ...fx.env, VALIDATOR_EXIT: '31', OPS_EXIT: '0' });
  assert.equal(denied.status, 31, denied.stderr);
  assert.doesNotMatch(await fs.readFile(fx.capture, 'utf8'), /up -d.*nginx/);

  await fs.writeFile(fx.capture, '');
  const allowed = run('start-nginx-gated.sh', { ...fx.env, OPS_EXIT: '0', OPS_FINAL_EXIT: '23' });
  assert.equal(allowed.status, 23, allowed.stderr);
  const calls = await fs.readFile(fx.capture, 'utf8');
  assert.match(calls, new RegExp(`--release-candidate ${releaseCandidate}`));
  assert.match(calls, new RegExp(`--tooling-head ${toolingHead}`));
  assert.match(calls, new RegExp(`--runtime-image-digest ${runtimeDigest}`));
  assert.match(calls, new RegExp(`--ops-image-digest ${opsDigest}`));
  assert.match(calls, new RegExp(`--candidate-tree ${candidateTree}`));
  assert.match(calls, /--application-input-manifest-sha256 9{64}/);
  assert.match(calls, new RegExp(`${regexEscape(fixedCompose)} --profile application --profile traffic up -d --no-deps --wait nginx`));
  assert.doesNotMatch(calls, /up -d[^\n]*(?:app|postgres)/);

  for (const [label, env] of [
    ['malformed digest', { RUNTIME_IMAGE_DIGEST: 'runtime:latest' }],
    ['old running image', { RUNNING_RUNTIME_DIGEST: `sha256:${'c'.repeat(64)}` }],
    ['candidate and tooling conflated', { REVIEWED_TOOLING_HEAD: releaseCandidate }],
    ['wrong candidate label', { RUNTIME_CANDIDATE_LABEL: 'unbound' }],
  ] as const) {
    await fs.writeFile(fx.capture, '');
    const result = run('start-nginx-gated.sh', { ...fx.env, ...env, OPS_EXIT: '0' });
    assert.notEqual(result.status, 0, label);
    assert.doesNotMatch(await fs.readFile(fx.capture, 'utf8'), /up -d.*nginx/);
  }
});

test('ambient Compose injection is ignored and an untracked override fails closed', async (t) => {
  const fx = await fixture(t);
  const malicious = path.join(fx.root, 'docker-compose.override.yml');
  await fs.writeFile(malicious, 'services:\n  migrator:\n    entrypoint: [/bin/true]\n');
  const ambient = run('start-nginx-gated.sh', {
    ...fx.env, OPS_EXIT: '0', COMPOSE_FILE: malicious, OPS_FINAL_EXIT: '23',
  });
  assert.equal(ambient.status, 23, ambient.stderr);
  const calls = await fs.readFile(fx.capture, 'utf8');
  assert.doesNotMatch(calls, new RegExp(regexEscape(malicious)));
  assert.match(calls, new RegExp(`compose_file= disable_env_file=1 args=${regexEscape(fixedCompose)}`));
  assert.match(calls, /verify-traffic-authorization/);

  await fs.writeFile(fx.capture, '');
  const untracked = run('start-nginx-gated.sh', {
    ...fx.env, OPS_EXIT: '0', GIT_STATUS_OUTPUT: '?? docker-compose.override.yml\n',
  });
  assert.notEqual(untracked.status, 0);
  assert.doesNotMatch(await fs.readFile(fx.capture, 'utf8'), /verify-traffic-authorization|up -d.*nginx/);
});

test('host preflight rejects missing provenance labels even when image IDs match', async (t) => {
  const fx = await fixture(t);
  const result = run('linux-host-preflight.sh', { ...fx.env, OPS_EXIT: '0', OPS_ROLE_LABEL: 'unbound' });
  assert.notEqual(result.status, 0);
});

test('host and traffic gates reject a self-consistent receipt that does not match the independent checkout', async (t) => {
  const fx = await fixture(t);
  for (const name of ['linux-host-preflight.sh', 'start-nginx-gated.sh'] as const) {
    await fs.writeFile(fx.capture, '');
    const result = run(name, {
      ...fx.env,
      CANDIDATE_TREE: 'c'.repeat(40),
      OPS_EXIT: '0',
      BUILD_VALIDATOR_EXIT: '31',
      VALIDATOR_EXIT: '31',
    });
    assert.notEqual(result.status, 0, name);
    const calls = await fs.readFile(fx.capture, 'utf8');
    assert.match(calls, /--candidate-tree c{40}/);
    assert.doesNotMatch(calls, /up -d.*nginx/);
  }
});

test('production image build rejects wrong or dirty candidate checkout before Docker', async (t) => {
  const fx = await fixture(t);
  for (const [label, env] of [
    ['wrong candidate', { CANDIDATE_HEAD: 'd'.repeat(40) }],
    ['dirty candidate', { CANDIDATE_STATUS_OUTPUT: '?? injected.js\n' }],
    ['attached candidate', { CANDIDATE_SYMBOLIC_REF_EXIT: '0' }],
  ] as const) {
    await fs.writeFile(fx.capture, '');
    const result = run('build-production-images.sh', { ...fx.env, ...env, OPS_EXIT: '0' });
    assert.notEqual(result.status, 0, label);
    assert.doesNotMatch(await fs.readFile(fx.capture, 'utf8'), /compose version|compose .* build/);
  }
});

test('runtime application bytes come only from the named candidate context', async () => {
  const [dockerfile, compose, traffic, buildReceipt] = await Promise.all([
    fs.readFile(path.join(repoRoot, 'Dockerfile'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'docker-compose.yml'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'packages/db-migrator/src/release/trafficAuthorization.ts'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'packages/db-migrator/src/release/productionBuildReceipt.ts'), 'utf8'),
  ]);
  assert.match(dockerfile, /^# syntax=docker\/dockerfile:1\.7/m);
  assert.match(dockerfile, /FROM node:20-slim AS runtime-builder[\s\S]*COPY --from=application_source packages\/server/);
  const runtime = /FROM node:20-slim AS runtime\b([\s\S]*?)FROM node:20-slim AS ops/.exec(dockerfile)?.[1] || '';
  for (const source of ['package.json', 'packages/shared', 'packages/client', 'packages/admin', 'packages/server']) {
    assert.match(runtime, new RegExp(`COPY --from=application_source ${source.replace('/', '\\/')}`));
  }
  assert.doesNotMatch(runtime, /COPY --from=builder .*?(?:dist|packages\/(?:server|shared|client|admin))/);
  assert.match(runtime, /COPY scripts\/ops\/postgres\/start-production-app\.cjs/);
  assert.match(runtime, /COPY --from=runtime-builder \/app\/\.consensus-application-inputs\.json/);
  assert.match(compose, /additional_contexts:\s*\n\s*application_source: \$\{APPLICATION_SOURCE_ROOT:-\.\}/);
  assert.match(traffic, /buildReceipt[\s\S]*runtimeApplicationInputSha256[\s\S]*verifyProductionBuildReceipt/);
  assert.match(traffic, /expectedCandidateTree[\s\S]*expectedApplicationInputSha256/);
  assert.match(buildReceipt, /expectedCandidateTree[\s\S]*expectedApplicationInputSha256/);
  for (const field of [
    'releaseCandidate', 'candidateTree', 'toolingHead', 'applicationInputManifest',
    'applicationInputManifestSha256', 'runtimeImageDigest', 'opsImageDigest',
  ]) assert.match(buildReceipt, new RegExp(field));
});

test('application input manifest binds paths and bytes without host filesystem execute bits', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'application-input-manifest-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const files = [
    'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml',
    'packages/shared/index.ts', 'packages/client/index.ts', 'packages/admin/index.ts',
    'packages/server/index.ts', 'packages/db-migrator/package.json',
  ];
  for (const [index, relative] of files.entries()) {
    const target = path.join(root, ...relative.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `fixture-${index}\n`);
  }
  const script = path.join(scriptsRoot, 'application-input-manifest.cjs');
  const result = spawnSync(process.execPath, [script, root, releaseCandidate], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(result.stdout) as {
    entries: Array<Record<string, string>>; manifestSha256: string;
  };
  assert.ok(manifest.entries.every((entry) => (
    Object.keys(entry).sort().join(',') === 'blobSha1,path'
  )));
  const canonical = manifest.entries.map((entry) => `${entry.blobSha1}\t${entry.path}\n`).join('');
  assert.equal(manifest.manifestSha256, createHash('sha256').update(canonical).digest('hex'));
});
