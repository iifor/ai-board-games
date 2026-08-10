const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '..');
const distRoot = path.join(serverRoot, 'dist');
const compiler = path.join(serverRoot, 'node_modules', 'typescript', 'lib', 'tsc.js');
const config = path.join(serverRoot, 'tsconfig.rehearsal.json');
const sourceMigrations = path.join(serverRoot, 'db', 'postgres', 'migrations');
const targetMigrations = path.join(distRoot, 'db', 'postgres', 'migrations');

execFileSync(process.execPath, [compiler, '-p', config], { cwd: serverRoot, stdio: 'inherit' });
fs.rmSync(targetMigrations, { recursive: true, force: true });
fs.mkdirSync(path.dirname(targetMigrations), { recursive: true });
fs.cpSync(sourceMigrations, targetMigrations, { recursive: true, force: true });
