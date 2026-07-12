import { createConcurrencyLimiter, positiveInt } from './concurrencyLimiter';

function createUpstreamConcurrency(llmLimit: unknown, ttsLimit: unknown) {
  const llmLimiter = createConcurrencyLimiter(positiveInt(llmLimit, 8));
  const ttsLimiter = createConcurrencyLimiter(positiveInt(ttsLimit, 4));
  let llm429 = 0;
  let ttsTimeout = 0;
  return {
    llmLimiter,
    ttsLimiter,
    recordLlm429: () => { llm429 += 1; },
    recordTtsTimeout: () => { ttsTimeout += 1; },
    stats: () => ({
      llm: llmLimiter.stats(),
      tts: ttsLimiter.stats(),
      llm429,
      ttsTimeout,
    }),
  };
}

const upstreamConcurrency = createUpstreamConcurrency(
  process.env.MAX_CONCURRENT_LLM_REQUESTS || 8,
  process.env.MAX_CONCURRENT_TTS_REQUESTS || 4,
);

export { createUpstreamConcurrency, upstreamConcurrency };
