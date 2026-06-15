import test from 'node:test';
import assert from 'node:assert/strict';
import { callOpenAIChat } from '../../packages/server/modules/llm/service';

test('LLM transient HTTP failures retry once and then succeed', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response('temporary', { status: 500 });
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await callOpenAIChat({
      apiKey: 'test',
      model: 'test',
      messages: [{ role: 'user', content: 'ping' }],
    });
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('LLM deterministic HTTP failures do not retry', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('bad request', { status: 400 });
  };
  try {
    await assert.rejects(() => callOpenAIChat({
      apiKey: 'test',
      model: 'test',
      messages: [{ role: 'user', content: 'ping' }],
    }));
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
