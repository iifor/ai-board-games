import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { TestContext } from 'node:test';

export const repoRoot = path.resolve(__dirname, '../..');
export const scriptsRoot = path.join(repoRoot, 'scripts', 'ops', 'postgres');
export const releaseCandidate = 'a066a4bb1fb9e49e50c742aa08248239f1d9a136';
export const toolingHead = '6469e71bd3f0a54c3b09356daad2be94016f5b87';
export const runtimeDigest = `sha256:${'a'.repeat(64)}`;
export const opsDigest = `sha256:${'b'.repeat(64)}`;
export const candidateTree = 'd'.repeat(40);
export const fixedProjectName = 'consensus-production';

export function shellPath(candidate: string): string {
  if (process.platform !== 'win32') return candidate;
  return `/${candidate[0].toLowerCase()}/${candidate.slice(3).replace(/\\/g, '/')}`;
}

export function shellExecutable(): string {
  if (process.platform !== 'win32') return 'sh';
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean) as string[];
  const candidate = roots.map((root) => path.join(root, 'Git', 'bin', 'sh.exe')).find(existsSync);
  if (!candidate) throw new Error('POSIX shell is required for Linux ops tests');
  return candidate;
}

export function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const fixedCompose = `compose --project-directory ${shellPath(repoRoot)} -f ${shellPath(path.join(repoRoot, 'docker-compose.yml'))} --project-name ${fixedProjectName}`;

export const scripts = [
  'linux-host-preflight.sh', 'build-production-images.sh', 'start-postgres-only.sh', 'backup-linux.sh',
  'verify-backup-linux.sh', 'production-preflight-linux.sh', 'cutover-once-linux.sh', 'restore-drill-linux.sh',
  'prepare-signoff-linux.sh', 'release-readiness-linux.sh', 'start-app-only.sh', 'start-nginx-gated.sh',
  'verify-observation-linux.sh',
] as const;

export async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'postgres-linux-ops-'));
  const bin = path.join(root, 'bin');
  const source = path.join(root, 'source');
  const candidate = path.join(root, 'candidate');
  const evidence = path.join(root, 'evidence');
  await Promise.all([fs.mkdir(bin), fs.mkdir(source), fs.mkdir(candidate), fs.mkdir(evidence)]);
  await fs.writeFile(path.join(source, 'source.sqlite'), 'source');
  for (const name of ['traffic-authorization.json', 'observation.json', 'freeze-receipt.json', 'production-build-receipt.json']) {
    await fs.writeFile(path.join(evidence, name), '{}');
  }
  const capture = path.join(root, 'calls.txt');
  const fakeDocker = `#!/bin/sh
printf 'compose_file=%s disable_env_file=%s args=%s\n' "\${COMPOSE_FILE-}" "\${COMPOSE_DISABLE_ENV_FILE-}" "$*" >> "$OPS_CAPTURE"
case "$*" in
  *"compose version --short"*) printf '%s\n' "\${COMPOSE_VERSION:-2.24.0}"; exit 0 ;;
esac
[ "\${OPS_SIGNAL:-}" != TERM ] || kill -TERM $$
case "$*" in
  *"image inspect consensus-production-app"*) exit 0 ;;
  *"image inspect consensus-production-migrator"*) exit 0 ;;
  *" ps -q app"*) printf '%s\n' app-container ;;
  *"image inspect --format {{.Id}} consensus-production-app"*) printf '%s\n' "$EXPECTED_RUNTIME_DIGEST" ;;
  *"image inspect --format {{.Id}} consensus-production-migrator"*) printf '%s\n' "$EXPECTED_OPS_DIGEST" ;;
  *"org.opencontainers.image.revision"*"consensus-production-app"*) printf '%s\n' "\${RUNTIME_TOOLING_LABEL:-$EXPECTED_TOOLING_HEAD}" ;;
  *"org.opencontainers.image.revision"*"consensus-production-migrator"*) printf '%s\n' "\${OPS_TOOLING_LABEL:-$EXPECTED_TOOLING_HEAD}" ;;
  *"org.consensus.application-candidate"*"consensus-production-app"*) printf '%s\n' "\${RUNTIME_CANDIDATE_LABEL:-$EXPECTED_RELEASE_CANDIDATE}" ;;
  *"org.consensus.application-candidate"*"consensus-production-migrator"*) printf '%s\n' "\${OPS_CANDIDATE_LABEL:-$EXPECTED_RELEASE_CANDIDATE}" ;;
  *"org.consensus.image-role"*"consensus-production-app"*) printf '%s\n' "\${RUNTIME_ROLE_LABEL:-runtime}" ;;
  *"org.consensus.image-role"*"consensus-production-migrator"*) printf '%s\n' "\${OPS_ROLE_LABEL:-ops}" ;;
  *"inspect --format {{.Image}} app-container"*) printf '%s\n' "\${RUNNING_RUNTIME_DIGEST:-$EXPECTED_RUNTIME_DIGEST}" ;;
  *"inspect --format {{.State.Health.Status}}"*) printf '%s\n' healthy ;;
  *".consensus-application-inputs.json"*) printf '%s\n' "$EXPECTED_APPLICATION_INPUT_SHA256" ;;
  *"application-input-manifest.cjs"*"--sha-only"*) printf '%s' "$EXPECTED_APPLICATION_INPUT_SHA256" ;;
  *"verify-production-build"*) exit "\${BUILD_VALIDATOR_EXIT:-0}" ;;
  *"verify-freeze-receipt"*) exit "\${FREEZE_VALIDATOR_EXIT:-0}" ;;
  *"verify-traffic-authorization"*) exit "\${VALIDATOR_EXIT:-0}" ;;
  *" up -d --no-deps --wait nginx"*) exit "\${OPS_FINAL_EXIT:-0}" ;;
esac
exit "\${OPS_EXIT:-0}"
`;
  const fakeGit = `#!/bin/sh
printf '%s\n' "$*" >> "$OPS_CAPTURE"
case "$*" in
  *"symbolic-ref -q HEAD"*) exit "\${CANDIDATE_SYMBOLIC_REF_EXIT:-1}" ;;
  *" rev-parse "*"^{tree}") printf '%s\n' "\${CANDIDATE_TREE:-$EXPECTED_CANDIDATE_TREE}" ;;
  *" rev-parse HEAD") case "$*" in *"$APPLICATION_SOURCE_ROOT"*) printf '%s\n' "\${CANDIDATE_HEAD:-$EXPECTED_RELEASE_CANDIDATE}" ;; *) printf '%s\n' "$EXPECTED_TOOLING_HEAD" ;; esac ;;
  *" status --porcelain=v1 --untracked-files=all") case "$*" in *"$APPLICATION_SOURCE_ROOT"*) printf '%s' "\${CANDIDATE_STATUS_OUTPUT:-}" ;; *) printf '%s' "\${GIT_STATUS_OUTPUT:-}" ;; esac ;;
esac
exit 0
`;
  await fs.writeFile(path.join(bin, 'docker'), fakeDocker);
  await fs.writeFile(path.join(bin, 'git'), fakeGit);
  await Promise.all([fs.chmod(path.join(bin, 'docker'), 0o755), fs.chmod(path.join(bin, 'git'), 0o755)]);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return {
    root, source, candidate, evidence, capture,
    env: {
      ...process.env, OPS_FAKE_BIN: shellPath(bin),
      OPS_CAPTURE: shellPath(capture), OPS_EXIT: '23', VALIDATOR_EXIT: '0', BUILD_VALIDATOR_EXIT: '0',
      EXPECTED_RELEASE_CANDIDATE: releaseCandidate, EXPECTED_TOOLING_HEAD: toolingHead,
      EXPECTED_CANDIDATE_TREE: candidateTree,
      EXPECTED_RUNTIME_DIGEST: runtimeDigest, EXPECTED_OPS_DIGEST: opsDigest,
      RELEASE_CANDIDATE_SHA: releaseCandidate, REVIEWED_TOOLING_HEAD: toolingHead,
      RUNTIME_IMAGE_DIGEST: runtimeDigest, OPS_IMAGE_DIGEST: opsDigest,
      APPLICATION_INPUT_MANIFEST_SHA256: '9'.repeat(64), EXPECTED_APPLICATION_INPUT_SHA256: '9'.repeat(64),
      FREEZE_RECEIPT_SHA256: 'c'.repeat(64), FREEZE_ID: 'freeze-first-deployment-001',
      FREEZE_RECEIPT_RELATIVE_PATH: 'freeze-receipt.json', SOURCE_ROOT: shellPath(source),
      APPLICATION_SOURCE_ROOT: shellPath(candidate), EVIDENCE_ROOT: shellPath(evidence),
      SOURCE_SQLITE_RELATIVE_PATH: 'source.sqlite', RESOURCE_RELATIVE_PATHS: 'resources',
      BACKUP_RELATIVE_PATH: 'backup', MANIFEST_RELATIVE_PATH: 'backup/manifest.json',
      RESOURCE_MAP_RELATIVE_PATH: 'backup/resource-map.json', RESTORE_RELATIVE_PATH: 'restore',
      MIGRATION_REPORT_RELATIVE_PATH: 'cutover.json', CUTOVER_AUTHORIZATION_RELATIVE_PATH: 'cutover-authorization.json',
      OPERATOR_SIGNOFF_RELATIVE_PATH: 'operator-signoff.json', REPORT_RELATIVE_PATHS: 'a.json,b.json',
      TRAFFIC_AUTHORIZATION_RELATIVE_PATH: 'traffic-authorization.json', OBSERVATION_RELATIVE_PATH: 'observation.json',
      BUILD_RECEIPT_RELATIVE_PATH: 'production-build-receipt.json', BUILD_RECEIPT_SHA256: 'd'.repeat(64),
      BUILD_RECEIPT_SIZE_BYTES: '1000', BUILD_ID: 'production-build-001',
      RUN_ID: 'first-deployment-test', GO_LIVE_OWNER: 'go-live-owner', ROLLBACK_OWNER: 'rollback-owner',
    },
  };
}

export function run(name: typeof scripts[number], env: NodeJS.ProcessEnv) {
  return spawnSync(shellExecutable(), [
    '-c', 'PATH="$OPS_FAKE_BIN:$PATH"; export PATH; exec "$1"',
    'postgres-linux-ops', shellPath(path.join(scriptsRoot, name)),
  ], {
    cwd: repoRoot, env, encoding: 'utf8',
  });
}
