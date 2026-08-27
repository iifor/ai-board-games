const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const composeFile = path.join(workspaceRoot, 'docker-compose.dev.yml');

const databaseDefaults = {
  DATABASE_URL: 'postgresql://consensus_dev@127.0.0.1:5432/consensus_local_v2',
  DATABASE_SCHEMA: 'consensus',
  DATABASE_SSL: 'false',
  DATABASE_POOL_MAX: '10',
  DATABASE_CONNECTION_TIMEOUT_MS: '5000',
  DATABASE_STATEMENT_TIMEOUT_MS: '30000'
};

function runCompose(args) {
  return spawnSync(
    'docker',
    ['compose', '-f', composeFile, ...args],
    { cwd: workspaceRoot, stdio: 'inherit' }
  );
}

function startDatabase() {
  const result = runCompose(['up', '-d', '--wait']);

  if (result.error) {
    console.error(`Unable to start the local PostgreSQL container: ${result.error.message}`);
    console.error('Start Docker Desktop, then run pnpm dev again.');
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error('Local PostgreSQL did not become healthy. Check Docker Desktop and the container logs.');
    process.exit(result.status || 1);
  }

  const schemaResult = runCompose([
    'exec', '-T', 'postgres',
    'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'consensus_dev', '-d', 'consensus_local_v2',
    '-c', 'CREATE SCHEMA IF NOT EXISTS consensus AUTHORIZATION consensus_dev'
  ]);
  if (schemaResult.error || schemaResult.status !== 0) {
    console.error('Unable to prepare the local consensus schema.');
    process.exit(schemaResult.status || 1);
  }
}

startDatabase();

if (process.argv.includes('--database-only')) process.exit(0);

const childEnv = { ...databaseDefaults, ...process.env };
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(pnpmCommand, ['run', 'dev:services'], {
  cwd: workspaceRoot,
  env: childEnv,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('error', (error) => {
  console.error(`Unable to start workspace services: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
