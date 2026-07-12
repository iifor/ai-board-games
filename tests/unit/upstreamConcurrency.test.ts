import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpstreamConcurrency } from '../../packages/server/utils/concurrency';

async function observePeak(limit: number, kind: 'llm' | 'tts'): Promise<number> {
  const upstream = createUpstreamConcurrency(limit, limit);
  const limiter = kind === 'llm' ? upstream.llmLimiter : upstream.ttsLimiter;
  let active = 0;
  let peak = 0;
  await Promise.all(Array.from({ length: limit * 2 }, () => limiter.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  })));
  return peak;
}

test('upstream concurrency caps LLM at eight and TTS at four', async () => {
  assert.equal(await observePeak(8, 'llm'), 8);
  assert.equal(await observePeak(4, 'tts'), 4);
});

test('upstream metrics count LLM 429 and TTS timeout', () => {
  const upstream = createUpstreamConcurrency(8, 4);
  upstream.recordLlm429();
  upstream.recordTtsTimeout();
  assert.equal(upstream.stats().llm429, 1);
  assert.equal(upstream.stats().ttsTimeout, 1);
});
