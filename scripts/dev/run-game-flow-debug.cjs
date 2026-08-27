const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  parseApiData,
  buildDebugScenarios,
  createFlowTracker,
} = require('./game-flow-debug-core.cjs');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(workspaceRoot, 'packages', 'server');
const localRunner = path.join(__dirname, 'run-local.cjs');
const databaseDefaults = {
  DATABASE_URL: 'postgresql://consensus_dev@127.0.0.1:5432/consensus_local_v2',
  DATABASE_SCHEMA: 'consensus',
  DATABASE_SSL: 'false',
  DATABASE_POOL_MAX: '10',
  DATABASE_CONNECTION_TIMEOUT_MS: '5000',
  DATABASE_STATEMENT_TIMEOUT_MS: '30000',
};

async function main() {
  const runId = createRunId();
  const startedAt = new Date();
  let options = null;
  let reportPath = resolveReportPath('', runId);
  let server = null;
  let report;

  try {
    options = parseArgs(process.argv.slice(2));
    reportPath = resolveReportPath(options.output, runId);
    if (!options.reuseServer) {
      startLocalDatabase();
      await assertPortAvailable(options.port);
      server = startServer(options.port);
    }

    const baseUrl = options.baseUrl || `http://127.0.0.1:${options.port}`;
    const health = await waitForHealth(baseUrl, server, options.startupTimeoutMs);
    const scenarios = buildDebugScenarios(health);
    const results = [];
    for (const scenario of scenarios) {
      process.stdout.write(`[debug:flows] ${scenario.label}开始\n`);
      const result = await runScenario(baseUrl, scenario, options.gameTimeoutMs);
      results.push(result);
      process.stdout.write(`[debug:flows] ${scenario.label}通过，gameId=${result.gameId}\n`);
    }

    report = {
      type: 'game-flow-debug-report',
      version: 1,
      runId,
      ok: true,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      baseUrl,
      database: { engine: 'postgresql', schema: databaseDefaults.DATABASE_SCHEMA },
      persistenceBoundary: 'debugMode does not write formal game history',
      results,
    };
  } catch (error) {
    report = {
      type: 'game-flow-debug-report',
      version: 1,
      runId,
      ok: false,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      error: sanitizeError(error),
    };
    process.exitCode = 1;
  } finally {
    await stopServer(server);
    writeReport(reportPath, report);
    const output = { ...report, reportPath };
    const stream = report?.ok ? process.stdout : process.stderr;
    stream.write(`${JSON.stringify(output, null, 2)}\n`);
  }
}

function parseArgs(args) {
  const options = {
    port: Number(process.env.DEBUG_FLOW_PORT || 3101),
    baseUrl: process.env.DEBUG_FLOW_BASE_URL || '',
    output: process.env.DEBUG_FLOW_OUTPUT || '',
    reuseServer: false,
    startupTimeoutMs: Number(process.env.DEBUG_FLOW_STARTUP_TIMEOUT_MS || 60000),
    gameTimeoutMs: Number(process.env.DEBUG_FLOW_GAME_TIMEOUT_MS || 300000),
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--reuse-server') options.reuseServer = true;
    else if (arg === '--port') options.port = parsePositiveInteger(args[++index], '--port');
    else if (arg === '--base-url') options.baseUrl = requireValue(args[++index], '--base-url');
    else if (arg === '--output') options.output = requireValue(args[++index], '--output');
    else if (arg === '--startup-timeout-ms') options.startupTimeoutMs = parsePositiveInteger(args[++index], arg);
    else if (arg === '--game-timeout-ms') options.gameTimeoutMs = parsePositiveInteger(args[++index], arg);
    else if (arg === '--help') {
      process.stdout.write([
        'Usage: pnpm debug:flows [options]',
        '  --reuse-server             use an already running server and skip Docker/server startup',
        '  --base-url <url>            server URL (default http://127.0.0.1:<port>)',
        '  --port <number>             isolated server port (default 3101)',
        '  --output <directory>        evidence directory (default tmp/debug-flows/<runId>)',
        '  --startup-timeout-ms <ms>   service startup timeout',
        '  --game-timeout-ms <ms>      timeout for each game',
      ].join('\n') + '\n');
      process.exit(0);
    } else throw new Error(`未知参数：${arg}`);
  }
  options.port = parsePositiveInteger(options.port, '--port');
  options.startupTimeoutMs = parsePositiveInteger(options.startupTimeoutMs, '--startup-timeout-ms');
  options.gameTimeoutMs = parsePositiveInteger(options.gameTimeoutMs, '--game-timeout-ms');
  if (options.baseUrl) options.baseUrl = normalizeBaseUrl(options.baseUrl);
  if (options.baseUrl) options.reuseServer = true;
  return options;
}

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => {
      reject(new Error(`隔离端口 ${port} 不可用：${error.code || error.message}`));
    });
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      probe.close((error) => error ? reject(error) : resolve());
    });
  });
}

function startLocalDatabase() {
  const result = spawnSync(process.execPath, [localRunner, '--database-only'], {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });
  if (result.error) throw new Error(`无法启动本地 PostgreSQL：${result.error.message}`);
  if (result.status !== 0) throw new Error(`本地 PostgreSQL 启动失败，退出码 ${result.status ?? 'unknown'}。`);
}

function startServer(port) {
  const child = spawn(
    process.execPath,
    ['--preserve-symlinks', '--preserve-symlinks-main', './dev-runtime.cjs'],
    {
      cwd: serverRoot,
      env: { ...databaseDefaults, ...process.env, API_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  return child;
}

async function waitForHealth(baseUrl, server, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '服务尚未响应';
  while (Date.now() < deadline) {
    if (server?.exitCode != null) throw new Error(`调试服务提前退出，退出码 ${server.exitCode}。`);
    try {
      const response = await fetch(`${baseUrl}/api/toc/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return parseApiData(await response.json());
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = sanitizeError(error);
    }
    await delay(500);
  }
  throw new Error(`等待调试服务健康检查超时：${lastError}`);
}

function runScenario(baseUrl, scenario, timeoutMs) {
  const WebSocketClient = resolveWebSocketClient();
  const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/api/toc/ws/game`;
  const tracker = createFlowTracker(scenario);
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const socket = new WebSocketClient(wsUrl);
    let settled = false;
    const timer = setTimeout(() => finish(new Error(`${scenario.label} 在 ${timeoutMs}ms 内未完成。`)), timeoutMs);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      if (error) reject(error);
      else resolve(value);
    }

    addSocketListener(socket, 'open', () => socket.send(JSON.stringify(scenario.startPayload)));
    addSocketListener(socket, 'message', (event) => {
      try {
        const raw = event?.data ?? event;
        const message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
        if (message.ackId != null) {
          socket.send(JSON.stringify({ type: 'ack', ackId: message.ackId }));
        }
        const game = tracker.accept(message);
        if (game) finish(null, tracker.summary(Date.now() - startedAt));
      } catch (error) {
        finish(error);
      }
    });
    addSocketListener(socket, 'error', () => finish(new Error(`${scenario.label} WebSocket 连接失败。`)));
    addSocketListener(socket, 'close', () => {
      if (settled) return;
      try {
        tracker.assertCompleted();
        finish(null, tracker.summary(Date.now() - startedAt));
      } catch (error) {
        finish(error);
      }
    });
  });
}

function resolveWebSocketClient() {
  if (globalThis.WebSocket) return globalThis.WebSocket;
  return require(path.join(serverRoot, 'node_modules', 'ws'));
}

function addSocketListener(socket, eventName, listener) {
  if (typeof socket.addEventListener === 'function') socket.addEventListener(eventName, listener);
  else socket.on(eventName, listener);
}

async function stopServer(server) {
  if (!server || server.exitCode != null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (server.exitCode == null) server.kill('SIGKILL');
      resolve();
    }, 5000);
    server.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    server.kill('SIGTERM');
  });
}

function writeReport(reportPath, report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function resolveReportPath(output, runId) {
  const directory = output
    ? path.resolve(workspaceRoot, output)
    : path.join(workspaceRoot, 'tmp', 'debug-flows', runId);
  return path.join(directory, `game-flow-debug-${runId}.json`);
}

function createRunId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `${timestamp}-${process.pid}-${Math.random().toString(16).slice(2, 10)}`;
}

function sanitizeError(error) {
  return String(error?.message || error || '未知错误')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')
    .slice(0, 1000);
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} 必须是正整数。`);
  return parsed;
}

function requireValue(value, name) {
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少值。`);
  return value;
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('--base-url 必须是有效的 HTTP(S) URL。');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('--base-url 仅支持 HTTP(S)。');
  }
  if (url.username || url.password) {
    throw new Error('--base-url 不允许包含用户名或密码。');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('--base-url 只能包含协议、主机和端口。');
  }
  return url.origin;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    type: 'game-flow-debug-fatal',
    ok: false,
    error: sanitizeError(error),
  })}\n`);
  process.exitCode = 1;
});

module.exports = { parseArgs, sanitizeError };
