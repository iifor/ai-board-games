import { monitorEventLoopDelay } from 'node:perf_hooks';
import { upstreamConcurrency } from './concurrency';

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

function concurrencySnapshot(games: { limit: number; active: number; rejected: number }) {
  const memory = process.memoryUsage();
  return {
    type: 'concurrency-metrics',
    games,
    ...upstreamConcurrency.stats(),
    eventLoopDelayP95Ms: Number((loopDelay.percentile(95) / 1e6).toFixed(2)),
    rssMb: Number((memory.rss / 1024 / 1024).toFixed(1)),
    heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(1)),
  };
}

export { concurrencySnapshot };
