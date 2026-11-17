import { afterEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay, startPolling } from './polling';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function deferred() {
  let resolve: (value: number | null) => void = () => undefined;
  const promise = new Promise<number | null>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('startPolling', () => {
  it('waits for the previous step to settle before scheduling the next, so slow requests never overlap', async () => {
    vi.useFakeTimers();
    const pending: ReturnType<typeof deferred>[] = [];
    const step = vi.fn(() => { const next = deferred(); pending.push(next); return next.promise; });
    const stop = startPolling(step);
    expect(step).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(step).toHaveBeenCalledTimes(1);
    pending[0]?.resolve(4000);
    await vi.advanceTimersByTimeAsync(3999);
    expect(step).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(step).toHaveBeenCalledTimes(2);
    stop();
    pending[1]?.resolve(4000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(step).toHaveBeenCalledTimes(2);
  });

  it('stops when the step returns null, and logs then stops when it throws', async () => {
    vi.useFakeTimers();
    const done = vi.fn(async () => null);
    startPolling(done);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(done).toHaveBeenCalledTimes(1);

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = vi.fn(async () => { throw new Error('bug'); });
    startPolling(broken);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(broken).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledOnce();
  });

  it('cancels a scheduled poll when stopped', async () => {
    vi.useFakeTimers();
    const step = vi.fn(async () => 2000);
    const stop = startPolling(step);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(step).toHaveBeenCalledTimes(1);
  });
});

it('backs off exponentially up to a cap', () => {
  expect([0, 1, 2, 3, 4, 10].map((failures) => backoffDelay(2000, failures, 30_000))).toEqual([2000, 2000, 4000, 8000, 16_000, 30_000]);
});
