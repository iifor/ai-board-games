const fs = require('node:fs');
const { spawn } = require('node:child_process');

const password = fs.readFileSync('/run/secrets/postgres_app_password', 'utf8').trim();
if (!password) throw new Error('postgres_app_password must be non-empty');

const child = spawn(
  process.execPath,
  ['--preserve-symlinks', '--preserve-symlinks-main', 'packages/server/dev-runtime.cjs'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://consensus_app:${encodeURIComponent(password)}@postgres:5432/consensus`,
    },
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}
child.once('error', (error) => {
  console.error(`Unable to start the production application: ${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
