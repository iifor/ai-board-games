const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../../packages/server/node_modules/typescript');

const root = path.resolve(__dirname, '../..');
const serverRoot = path.join(root, 'packages', 'server');
const pnpmRoot = path.join(root, 'node_modules', '.pnpm');
const requestedFiles = new Set(process.argv.slice(2).filter((value) => value.endsWith('.test.ts')).map((value) => path.basename(value)));
const availableTestFiles = [
  'dbExecutor.test.ts',
  'schemaMigration.test.ts',
  'coreRepositories.test.ts',
  'authIntegration.test.ts',
  'llmQuotaIntegration.test.ts',
  'applicationSmokeLifecycle.test.ts',
  'applicationSmoke.test.ts',
  'gameApplicationIntegration.test.ts',
  'gameRepositories.test.ts',
  'workflowConcurrency.test.ts',
  'sqliteImporter.test.ts',
  'preflightCommand.test.ts',
  'validateMigration.test.ts',
  'rehearsalCommand.test.ts',
  'cutoverTargetSession.test.ts',
  'cutoverAdapter.test.ts',
  'cutoverSmokeAdapter.test.ts',
  'cutoverCommand.test.ts',
  'cutoverProductionIntegration.test.ts',
];
const unknownFiles = [...requestedFiles].filter((file) => !availableTestFiles.includes(file));
if (unknownFiles.length) throw new Error(`Unknown PostgreSQL test file(s): ${unknownFiles.join(', ')}`);
const testFiles = availableTestFiles
  .filter((file) => requestedFiles.size === 0 || requestedFiles.has(file))
  .map((file) => path.join(__dirname, file));
const originalTsLoader = Module._extensions['.ts'];

if (fs.existsSync(pnpmRoot)) {
  const pnpmModulePaths = fs.readdirSync(pnpmRoot)
    .map((name) => path.join(pnpmRoot, name, 'node_modules'))
    .filter((entry) => fs.existsSync(entry));
  process.env.NODE_PATH = [
    path.join(serverRoot, 'node_modules'),
    ...pnpmModulePaths,
    process.env.NODE_PATH || '',
  ].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}

Module._extensions['.ts'] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      skipLibCheck: true,
      sourceMap: false,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

try {
  process.chdir(root);
  for (const file of testFiles) require(file);
} finally {
  if (originalTsLoader) Module._extensions['.ts'] = originalTsLoader;
}
