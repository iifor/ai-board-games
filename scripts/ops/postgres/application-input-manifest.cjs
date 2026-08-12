const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '');
const releaseCandidate = process.argv[3] || '';
const inputPaths = [
  'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml',
  'packages/shared', 'packages/client', 'packages/admin', 'packages/server',
  'packages/db-migrator/package.json',
];

if (!(releaseCandidate === 'unbound' || /^[a-f0-9]{40}$/.test(releaseCandidate)) || !root) {
  throw new Error('invalid manifest input');
}

function blobSha1(bytes) {
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function visit(candidate, relative, entries) {
  const stats = fs.lstatSync(candidate);
  if (stats.isDirectory()) {
    for (const name of fs.readdirSync(candidate).sort()) visit(path.join(candidate, name), `${relative}/${name}`, entries);
    return;
  }
  const bytes = stats.isSymbolicLink() ? Buffer.from(fs.readlinkSync(candidate)) : fs.readFileSync(candidate);
  entries.push({ blobSha1: blobSha1(bytes), path: relative.replace(/\\/g, '/') });
}

const entries = [];
for (const relative of inputPaths) visit(path.join(root, ...relative.split('/')), relative, entries);
entries.sort((left, right) => (left.path < right.path ? -1 : (left.path > right.path ? 1 : 0)));
const canonical = entries.map((entry) => `${entry.blobSha1}\t${entry.path}\n`).join('');
const manifest = {
  version: 1,
  purpose: 'consensus-application-build-inputs',
  releaseCandidate,
  inputPaths,
  entries,
  manifestSha256: crypto.createHash('sha256').update(canonical).digest('hex'),
};
if (process.argv[4] === '--sha-only') process.stdout.write(manifest.manifestSha256);
else process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
