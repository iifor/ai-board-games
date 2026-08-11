const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { constants } = require('node:os');

function readPassword(file, label) {
  let value = fs.readFileSync(file, 'utf8');
  if (value.endsWith('\r\n')) value = value.slice(0, -2);
  else if (value.endsWith('\n')) value = value.slice(0, -1);
  if (!value) throw new Error(`${label} must be non-empty`);
  return value;
}

const password = readPassword('/run/secrets/postgres_migrator_password', 'postgres_migrator_password');

const child = spawn(process.execPath, ['packages/db-migrator/dist/cli.js', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: `postgresql://consensus_migrator:${encodeURIComponent(password)}@postgres:5432/consensus`,
  },
});

const forwardedSignals = ['SIGINT', 'SIGTERM'];
const forwarders = new Map();
for (const signal of forwardedSignals) {
  const forward = () => child.kill(signal);
  forwarders.set(signal, forward);
  process.once(signal, forward);
}
function removeSignalForwarders() {
  for (const [signal, forward] of forwarders) process.removeListener(signal, forward);
}
child.once('error', (error) => {
  removeSignalForwarders();
  console.error(`Unable to start the production migrator: ${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  removeSignalForwarders();
  if (signal) {
    process.exitCode = 128 + (constants.signals[signal] ?? 0);
    return;
  }
  process.exitCode = code ?? 1;
});
