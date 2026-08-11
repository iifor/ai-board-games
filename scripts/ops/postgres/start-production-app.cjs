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

const password = readPassword('/run/secrets/postgres_app_password', 'postgres_app_password');

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

const forwardedSignals = ['SIGINT', 'SIGTERM'];
const forwarders = new Map();
let receivedSignal = null;
for (const signal of forwardedSignals) {
  const forward = () => {
    receivedSignal ??= signal;
    child.kill(signal);
  };
  forwarders.set(signal, forward);
  process.once(signal, forward);
}
function removeSignalForwarders() {
  for (const [signal, forward] of forwarders) process.removeListener(signal, forward);
}
child.once('error', (error) => {
  removeSignalForwarders();
  console.error(`Unable to start the production application: ${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  removeSignalForwarders();
  const interruptionSignal = receivedSignal || signal;
  if (interruptionSignal) {
    process.exitCode = 128 + (constants.signals[interruptionSignal] ?? 0);
    return;
  }
  process.exitCode = code ?? 1;
});
