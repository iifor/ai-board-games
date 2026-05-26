const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('./node_modules/typescript');

const root = __dirname;
const workspaceRoot = path.resolve(root, '../..');
const pnpmRoot = path.join(workspaceRoot, 'node_modules', '.pnpm');

if (fs.existsSync(pnpmRoot)) {
  const pnpmModulePaths = fs.readdirSync(pnpmRoot)
    .map((name) => path.join(pnpmRoot, name, 'node_modules'))
    .filter((entry) => fs.existsSync(entry));
  process.env.NODE_PATH = [
    path.join(root, 'node_modules'),
    ...pnpmModulePaths,
    process.env.NODE_PATH || '',
  ].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}

Module._extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      resolveJsonModule: true,
      skipLibCheck: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

require(path.join(root, 'index.ts'));
