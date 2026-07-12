import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithTraceContext, getCurrentTraceContext } from '../../packages/server/modules/observability/tracer';

test('async-local trace context stays isolated across five overlapping games', async () => {
  const seen = await Promise.all(Array.from({ length: 5 }, (_, index) => {
    const trace = { traceId: `trace-${index}`, gameId: `game-${index}` };
    return runWithTraceContext(trace as never, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5 - index));
      return getCurrentTraceContext()?.traceId;
    });
  }));
  assert.deepEqual(seen, ['trace-0', 'trace-1', 'trace-2', 'trace-3', 'trace-4']);
  assert.equal(getCurrentTraceContext(), null);
});
