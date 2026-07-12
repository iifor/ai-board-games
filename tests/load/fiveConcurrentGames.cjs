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
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`game ${index} timed out`));
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
        clearTimeout(timer);
        socket.close();
        reject(new Error(`game ${index}: ${message.message}`));
      }
      const payload = message.event || message.payload || message;
      if (payload.type === 'workflow-completed') {
        clearTimeout(timer);
        socket.close();
        resolve({ index, gameId: payload.game?.id || null });
      }
    });
    socket.addEventListener('error', () => reject(new Error(`game ${index}: WebSocket connection failed`)));
    socket.addEventListener('close', () => {
      clearTimeout(timer);
      resolve({ index, gameId: null });
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
