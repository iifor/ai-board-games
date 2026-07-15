const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../../packages/server/node_modules/typescript');

const root = path.resolve(__dirname, '../..');
const serverRoot = path.join(root, 'packages', 'server');
const pnpmRoot = path.join(root, 'node_modules', '.pnpm');
const requestedFiles = process.argv.slice(2);
const testFiles = (requestedFiles.length ? requestedFiles : [
  'gameSocketSession.test.ts',
  'concurrencyLimiter.test.ts',
  'gameSessionConcurrency.test.ts',
  'upstreamConcurrency.test.ts',
  'traceConcurrency.test.ts',
  'authProductionConfig.test.ts',
  'serverLifecycle.test.ts',
  'deploymentConfig.test.ts',
  'gameEventBuilder.test.ts',
  'eventBus.test.ts',
  'audienceStream.test.ts',
  'skillEventEmitter.test.ts',
  'gameEngineContracts.test.ts',
  'gameEngineActionEffect.test.ts',
  'werewolfNightResolutionAudit.test.ts',
  'werewolfChannelGuard.test.ts',
  'werewolfInteractionFeedbackTrace.test.ts',
  'werewolfActionEngineBridge.test.ts',
  'werewolfPromptRecentContext.test.ts',
  'werewolfPromptContext.test.ts',
  'playerMemory.test.ts',
  'werewolfClientDisplayState.test.ts',
  'werewolfPresentationProjection.test.ts',
  'werewolfSetup.test.ts',
  'werewolfV2InteractionState.test.ts',
  'gameNavigation.test.ts',
  'llmRetry.test.ts',
  'traceParticipants.test.ts',
  'nightResolutionAuditViewModel.test.ts',
  'werewolfPostgameRules.test.ts'
  ,'werewolfDefaultConfig.test.ts'
  ,'edgeTts.test.ts'
]).map((file) => path.join(__dirname, file));

const originalTsLoader = Module._extensions['.ts'];
const originalTsxLoader = Module._extensions['.tsx'];

if (fs.existsSync(pnpmRoot)) {
  const pnpmModulePaths = fs.readdirSync(pnpmRoot)
    .map((name) => path.join(pnpmRoot, name, 'node_modules'))
    .filter((entry) => fs.existsSync(entry));
  process.env.NODE_PATH = [
    path.join(serverRoot, 'node_modules'),
    ...pnpmModulePaths,
    process.env.NODE_PATH || ''
  ].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}

function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      jsx: ts.JsxEmit.ReactJSX,
      skipLibCheck: true,
      sourceMap: false
    },
    fileName: filename
  }).outputText;
  module._compile(output, filename);
}
Module._extensions['.ts'] = loadTypeScript;
Module._extensions['.tsx'] = loadTypeScript;

try {
  process.chdir(root);
  for (const file of testFiles) require(file);
} finally {
  if (originalTsLoader) Module._extensions['.ts'] = originalTsLoader;
  if (originalTsxLoader) Module._extensions['.tsx'] = originalTsxLoader;
  else delete Module._extensions['.tsx'];
}
