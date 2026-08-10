const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '..');
const distRoot = path.join(serverRoot, 'dist');
const compiler = path.join(serverRoot, 'node_modules', 'typescript', 'lib', 'tsc.js');
const config = path.join(serverRoot, 'tsconfig.rehearsal.json');
const sourceMigrations = path.join(serverRoot, 'db', 'postgres', 'migrations');
const targetMigrations = path.join(distRoot, 'db', 'postgres', 'migrations');
const opsRoot = path.join(distRoot, 'ops');
const opsServerRoot = path.join(opsRoot, 'server');
const opsMigrations = path.join(opsServerRoot, 'db', 'postgres', 'migrations');

fs.rmSync(opsRoot, { recursive: true, force: true });
execFileSync(process.execPath, [compiler, '-p', config], { cwd: serverRoot, stdio: 'inherit' });
fs.rmSync(opsMigrations, { recursive: true, force: true });
fs.mkdirSync(path.dirname(opsMigrations), { recursive: true });
fs.cpSync(sourceMigrations, opsMigrations, { recursive: true, force: true });
fs.cpSync(path.join(opsServerRoot, 'db'), path.join(distRoot, 'db'), { recursive: true, force: true });
fs.rmSync(targetMigrations, { recursive: true, force: true });
fs.mkdirSync(path.dirname(targetMigrations), { recursive: true });
fs.cpSync(sourceMigrations, targetMigrations, { recursive: true, force: true });
