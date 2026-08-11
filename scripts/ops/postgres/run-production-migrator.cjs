const fs = require('node:fs');
const { spawn } = require('node:child_process');

const password = fs.readFileSync('/run/secrets/postgres_migrator_password', 'utf8').trim();
if (!password) throw new Error('postgres_migrator_password must be non-empty');

const child = spawn(process.execPath, ['packages/db-migrator/dist/cli.js', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: `postgresql://consensus_migrator:${encodeURIComponent(password)}@postgres:5432/consensus`,
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}
child.once('error', (error) => {
  console.error(`Unable to start the production migrator: ${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
