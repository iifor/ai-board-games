import test from 'node:test';
import assert from 'node:assert/strict';
import { BasePlayerAgent } from '../../packages/server/modules/agent-core/playerAgent';
import { callModelChatWithFallback } from '../../packages/server/modules/llm/service';
import { createPlayerSchema } from '../../packages/server/modules/players/validator';
import { playerToRow, rowToPlayer } from '../../packages/server/modules/players/utils';
import { modelToRow } from '../../packages/server/modules/models/utils';
import { getDb } from '../../packages/server/db';
import { z } from 'zod';

const messages = [{ role: 'user', content: 'hello' }];

function model(baseUrl: string, name: string, modelId?: number) {
  return {
    apiKey: `${name}-key`,
    baseUrl,
    provider: name,
    model: name,
    modelId,
    apiFormat: 'openai-compatible',
    messages,
  };
}

function insertEnabledModel(name: string): number {
  const result = getDb().prepare(`
    INSERT INTO models (
      provider_id, provider, name, base_url, api_format,
      api_key_cipher, api_key_iv, api_key_tag,
      thinking_enabled, enabled, created_at, updated_at
    ) VALUES (
      NULL, 'test', ?, '', 'openai-compatible',
      '', '', '',
      0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(name);
  return Number(result.lastInsertRowid);
}

function readModelEnabled(modelId: number): number {
  return Number((getDb().prepare('SELECT enabled FROM models WHERE id = ?').get(modelId) as { enabled: number }).enabled);
}

function openAiResponse(content: string, status = 200): Response {
  return new Response(
    status === 200 ? JSON.stringify({ choices: [{ message: { content } }] }) : content,
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

async function withFetch(
  handler: (url: string) => Response | Promise<Response>,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo) => handler(String(input))) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('uses the primary model without calling the fallback model', async () => {
  const urls: string[] = [];
  await withFetch((url) => {
    urls.push(url);
    return openAiResponse('primary reply');
  }, async () => {
    const reply = await callModelChatWithFallback(
      model('https://primary.test/v1', 'primary'),
      model('https://fallback.test/v1', 'fallback'),
    );
    assert.equal(reply, 'primary reply');
  });
  assert.deepEqual(urls, ['https://primary.test/v1/chat/completions']);
});

test('uses the fallback model once after the primary model fails', async () => {
  const urls: string[] = [];
  await withFetch((url) => {
    urls.push(url);
    return url.includes('primary.test')
      ? openAiResponse('primary failed', 400)
      : openAiResponse('fallback reply');
  }, async () => {
    const reply = await callModelChatWithFallback(
      model('https://primary.test/v1', 'primary'),
      model('https://fallback.test/v1', 'fallback'),
    );
    assert.equal(reply, 'fallback reply');
  });
  assert.deepEqual(urls, [
    'https://primary.test/v1/chat/completions',
    'https://fallback.test/v1/chat/completions',
  ]);
});

test('disables and skips a model after the provider reports exhausted balance', async () => {
  const modelId = insertEnabledModel(`quota-exhausted-${Date.now()}`);
  const urls: string[] = [];
  try {
    await withFetch((url) => {
      urls.push(url);
      return url.includes('primary.test')
        ? openAiResponse(JSON.stringify({
          error: {
            code: 'PostpaidBillOverdue',
            message: 'The postpaid bill is overdue.',
          },
        }), 429)
        : openAiResponse('fallback reply');
    }, async () => {
      const primary = model('https://primary.test/v1', 'primary', modelId);
      const fallback = model('https://fallback.test/v1', 'fallback');
      assert.equal(await callModelChatWithFallback(primary, fallback), 'fallback reply');
      assert.equal(readModelEnabled(modelId), 0);
      assert.equal(await callModelChatWithFallback(primary, fallback), 'fallback reply');
    });
    assert.deepEqual(urls, [
      'https://primary.test/v1/chat/completions',
      'https://fallback.test/v1/chat/completions',
      'https://fallback.test/v1/chat/completions',
    ]);
  } finally {
    getDb().prepare('DELETE FROM models WHERE id = ?').run(modelId);
  }
});

test('does not disable a model for ordinary rate limiting', async () => {
  const modelId = insertEnabledModel(`rate-limited-${Date.now()}`);
  try {
    await withFetch((url) => url.includes('primary.test')
      ? openAiResponse(JSON.stringify({
        error: {
          code: 'Throttling.RateQuota',
          message: 'Requests rate limit exceeded, please try again later.',
        },
      }), 429)
      : openAiResponse('fallback reply'), async () => {
      const reply = await callModelChatWithFallback(
        model('https://primary.test/v1', 'primary', modelId),
        model('https://fallback.test/v1', 'fallback'),
      );
      assert.equal(reply, 'fallback reply');
    });
    assert.equal(readModelEnabled(modelId), 1);
  } finally {
    getDb().prepare('DELETE FROM models WHERE id = ?').run(modelId);
  }
});

test('uses the fallback model when the primary model returns invalid JSON', async () => {
  const urls: string[] = [];
  await withFetch((url) => {
    urls.push(url);
    return url.includes('primary.test')
      ? openAiResponse('not json')
      : openAiResponse('{"targetSeat":2}');
  }, async () => {
    const agent = new BasePlayerAgent({
      id: 1,
      ...model('https://primary.test/v1', 'primary'),
    }, 'system', {
      fallbackModel: model('https://fallback.test/v1', 'fallback'),
    });
    const result = await agent.askJsonOnce('choose', { promptHasContract: true });
    assert.deepEqual(result, { targetSeat: 2 });
  });
  assert.deepEqual(urls, [
    'https://primary.test/v1/chat/completions',
    'https://fallback.test/v1/chat/completions',
  ]);
});

test('askJson retries a refined schema failure once and returns validated data', async () => {
  let calls = 0;
  await withFetch(() => {
    calls += 1;
    return openAiResponse(calls === 1 ? '{"targetId":1}' : '{"targetId":2}');
  }, async () => {
    const agent = new BasePlayerAgent({
      id: 1,
      ...model('https://primary.test/v1', 'primary'),
    }, 'system');
    const result = await agent.askJson('choose', {
      promptHasContract: true,
      schema: z.object({ targetId: z.number().refine((targetId) => [2, 3].includes(targetId)) }),
    });
    assert.deepEqual(result, { targetId: 2 });
  });
  assert.equal(calls, 2);
});

test('maps and validates a distinct fallback model', () => {
  const row = playerToRow({ id: 1, nickname: 'A', modelId: 10, fallbackModelId: 11 });
  assert.equal(row.fallback_model_id, 11);
  assert.equal(rowToPlayer({
    ...row,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  })?.fallbackModelId, 11);

  const result = createPlayerSchema.safeParse({ nickname: 'A', modelId: 10, fallbackModelId: 10 });
  assert.equal(result.success, false);
});

test('allows an explicitly re-enabled model to recover after quota is restored', () => {
  const row = modelToRow(
    { enabled: true },
    { id: 1, name: 'test', enabled: true },
    {
      id: 9,
      provider_id: 1,
      provider: 'test',
      name: 'test-model',
      base_url: '',
      api_format: 'openai-compatible',
      api_key_cipher: '',
      api_key_iv: '',
      api_key_tag: '',
      thinking_enabled: 0,
      enabled: 0,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
  );
  assert.equal(row.enabled, 1);
});
