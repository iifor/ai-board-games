const { monitorEventLoopDelay } = require('node:perf_hooks');
const WebSocket = globalThis.WebSocket;

if (!WebSocket) throw new Error('This load test requires Node.js 22+ with the built-in WebSocket client');

const url = process.env.CONCURRENCY_TEST_WS_URL || 'ws://127.0.0.1:3001/api/toc/ws/game';
const timeoutMs = Number(process.env.CONCURRENCY_TEST_TIMEOUT_MS || 240000);
const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();
let peakRss = 0;
let peakHeap = 0;
const sampler = setInterval(() => {
  const memory = process.memoryUsage();
  peakRss = Math.max(peakRss, memory.rss);
  peakHeap = Math.max(peakHeap, memory.heapUsed);
}, 50);

function runGame(index) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    let completed = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      finish(new Error(`game ${index} timed out before workflow-completed`));
    }, timeoutMs);
    socket.addEventListener('open', () => socket.send(JSON.stringify({
      type: 'start',
      mode: 'real',
      gameType: 'werewolf',
      werewolfMode: 'standard-12',
      clientViewMode: 'god',
      debugMode: true,
    })));
    socket.addEventListener('message', (messageEvent) => {
      const message = JSON.parse(String(messageEvent.data));
      if (message.ackId != null) socket.send(JSON.stringify({ type: 'ack', ackId: message.ackId }));
      if (message.type === 'error') {
        finish(new Error(`game ${index}: ${message.message}`));
      }
      const payload = message.event || message.payload || message;
      if (payload.type === 'workflow-completed') {
        const gameId = payload.game?.id || null;
        if (!gameId) {
          finish(new Error(`game ${index}: workflow-completed did not include game.id`));
          return;
        }
        completed = true;
        finish(null, { index, gameId });
      }
    });
    socket.addEventListener('error', () => finish(new Error(`game ${index}: WebSocket connection failed`)));
    socket.addEventListener('close', () => {
      if (!completed) finish(new Error(`game ${index}: socket closed before workflow-completed`));
    });
  });
}

Promise.all(Array.from({ length: 5 }, (_, index) => runGame(index + 1)))
  .then((games) => {
    clearInterval(sampler);
    delay.disable();
    console.log(JSON.stringify({
      type: 'five-game-concurrency-result',
      ok: true,
      url,
      games,
      eventLoopDelayP95Ms: Number((delay.percentile(95) / 1e6).toFixed(2)),
      peakRssMb: Number((peakRss / 1024 / 1024).toFixed(1)),
      peakHeapMb: Number((peakHeap / 1024 / 1024).toFixed(1)),
    }));
  })
  .catch((error) => {
    clearInterval(sampler);
    delay.disable();
    console.error(JSON.stringify({ type: 'five-game-concurrency-result', ok: false, error: error.message }));
    process.exitCode = 1;
  });
