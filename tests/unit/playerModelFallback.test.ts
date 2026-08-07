import test from 'node:test';
import assert from 'node:assert/strict';
import { BasePlayerAgent } from '../../packages/server/modules/agent-core/playerAgent';
import { callModelChatWithFallback } from '../../packages/server/modules/llm/service';
import { createPlayerSchema } from '../../packages/server/modules/players/validator';
import { playerToRow, rowToPlayer } from '../../packages/server/modules/players/utils';
import { getDb } from '../../packages/server/db';
import * as modelsService from '../../packages/server/modules/models/service';
import * as modelProvidersService from '../../packages/server/modules/model-providers/service';
import { upstreamConcurrency } from '../../packages/server/utils/concurrency';
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

function insertEnabledModel(name: string, providerId: number | null = null): number {
  const result = getDb().prepare(`
    INSERT INTO models (
      provider_id, provider, name, base_url, api_format,
      api_key_cipher, api_key_iv, api_key_tag,
      thinking_enabled, enabled, created_at, updated_at
    ) VALUES (
      ?, 'test', ?, '', 'openai-compatible',
      '', '', '',
      0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(providerId, name);
  return Number(result.lastInsertRowid);
}

function insertEnabledModelProvider(name: string): number {
  const result = getDb().prepare(`
    INSERT INTO model_providers (
      name, base_url, api_format,
      api_key_cipher, api_key_iv, api_key_tag,
      enabled, created_at, updated_at
    ) VALUES (?, '', 'openai-compatible', '', '', '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(name);
  return Number(result.lastInsertRowid);
}

function readModelStatus(id: number) {
  return getDb().prepare(
    'SELECT enabled, disabled_reason, disabled_at FROM models WHERE id = ?',
  ).get(id) as {
    enabled: number;
    disabled_reason: string | null;
    disabled_at: string | null;
  };
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

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
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
      const exhausted = readModelStatus(modelId);
      assert.equal(exhausted.enabled, 0);
      assert.equal(exhausted.disabled_reason, 'quota_exhausted');
      assert.match(exhausted.disabled_at || '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
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
    const limited = readModelStatus(modelId);
    assert.equal(limited.enabled, 1);
    assert.equal(limited.disabled_reason, null);
    assert.equal(limited.disabled_at, null);
  } finally {
    getDb().prepare('DELETE FROM models WHERE id = ?').run(modelId);
  }
});

test('queued LLM work rechecks the quota circuit breaker before fetching', async () => {
  const modelId = insertEnabledModel(`queued-quota-${Date.now()}`);
  const limit = upstreamConcurrency.llmLimiter.stats().limit;
  let primaryFetches = 0;
  let releaseQuotaResponse!: () => void;
  let releaseOtherResponses!: () => void;
  const quotaResponseGate = new Promise<void>((resolve) => { releaseQuotaResponse = resolve; });
  const otherResponsesGate = new Promise<void>((resolve) => { releaseOtherResponses = resolve; });

  try {
    let queuedReply = '';
    await withFetch(async (url) => {
      if (url.includes('fallback.test')) return openAiResponse('fallback reply');
      primaryFetches += 1;
      if (primaryFetches === 1) {
        await quotaResponseGate;
        return openAiResponse(JSON.stringify({
          error: {
            code: 'PostpaidBillOverdue',
            message: 'The postpaid bill is overdue.',
          },
        }), 429);
      }
      await otherResponsesGate;
      return openAiResponse('already-started primary reply');
    }, async () => {
      const primary = model('https://primary.test/v1', 'primary', modelId);
      const fallback = model('https://fallback.test/v1', 'fallback');
      const activeCalls = Array.from({ length: limit }, () => callModelChatWithFallback(primary, fallback));

      await waitFor(
        () => primaryFetches === limit,
        `expected ${limit} active primary requests, received ${primaryFetches}`,
      );
      const queuedCall = callModelChatWithFallback(primary, fallback);
      await waitFor(
        () => upstreamConcurrency.llmLimiter.stats().queued > 0,
        'expected one LLM request to wait in the limiter queue',
      );

      releaseQuotaResponse();
      releaseOtherResponses();
      [queuedReply] = await Promise.all([queuedCall, Promise.all(activeCalls).then(() => '')]);
    });

    assert.equal(queuedReply, 'fallback reply');
    assert.equal(primaryFetches, limit);
  } finally {
    releaseQuotaResponse();
    releaseOtherResponses();
    getDb().prepare('DELETE FROM models WHERE id = ?').run(modelId);
  }
});

test('marks both models quota exhausted when the fallback is also exhausted', async () => {
  const primaryId = insertEnabledModel(`primary-quota-${Date.now()}`);
  const fallbackId = insertEnabledModel(`fallback-quota-${Date.now()}`);
  try {
    await withFetch(() => openAiResponse(JSON.stringify({
      error: {
        code: 'AllocationQuota.FreeTierOnly',
        message: 'Free allocated quota exceeded.',
      },
    }), 429), async () => {
      await assert.rejects(
        callModelChatWithFallback(
          model('https://primary.test/v1', 'primary', primaryId),
          model('https://fallback.test/v1', 'fallback', fallbackId),
        ),
        AggregateError,
      );
    });

    for (const modelId of [primaryId, fallbackId]) {
      const exhausted = readModelStatus(modelId);
      assert.equal(exhausted.enabled, 0);
      assert.equal(exhausted.disabled_reason, 'quota_exhausted');
      assert.ok(exhausted.disabled_at);
    }
  } finally {
    getDb().prepare('DELETE FROM models WHERE id IN (?, ?)').run(primaryId, fallbackId);
  }
});

test('keeps models available for non-quota failures', async () => {
  const cases = [
    ['server error', () => openAiResponse('upstream failed', 500)],
    ['validation error', () => openAiResponse('invalid request', 400)],
    ['unrelated 400 balance message', () => openAiResponse(JSON.stringify({
      error: { code: 'BadRequest', message: 'The prompt quotes 余额不足.' },
    }), 400)],
    ['unrelated 403 balance message', () => openAiResponse(JSON.stringify({
      error: { code: 'PermissionDenied', message: 'The prompt quotes insufficient balance.' },
    }), 403)],
    ['network error', () => { throw new TypeError('fetch failed'); }],
  ] as const;

  for (const [name, failure] of cases) {
    const modelId = insertEnabledModel(`non-quota-${name}-${Date.now()}`);
    try {
      await withFetch((url) => url.includes('primary.test')
        ? failure()
        : openAiResponse('fallback reply'), async () => {
        assert.equal(
          await callModelChatWithFallback(
            model('https://primary.test/v1', 'primary', modelId),
            model('https://fallback.test/v1', 'fallback'),
          ),
          'fallback reply',
        );
      });
      assert.deepEqual(readModelStatus(modelId), {
        enabled: 1,
        disabled_reason: null,
        disabled_at: null,
      });
    } finally {
      getDb().prepare('DELETE FROM models WHERE id = ?').run(modelId);
    }
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

test('allows an explicitly re-enabled model to recover after quota is restored', async () => {
  const providerId = insertEnabledModelProvider(`recovery-provider-${Date.now()}`);
  const modelId = insertEnabledModel(`recovery-model-${Date.now()}`, providerId);
  let restored = false;
  try {
    await withFetch((url) => {
      if (!url.includes('primary.test')) return openAiResponse('fallback reply');
      return restored
        ? openAiResponse('restored')
        : openAiResponse(JSON.stringify({
          error: { code: 'AllocationQuota.FreeTierOnly', message: 'Free allocated quota exceeded.' },
        }), 429);
    }, async () => {
      const primary = model('https://primary.test/v1', 'primary', modelId);
      const fallback = model('https://fallback.test/v1', 'fallback');
      assert.equal(await callModelChatWithFallback(primary, fallback), 'fallback reply');

      modelsService.updateModel(modelId, { enabled: true });
      assert.deepEqual(readModelStatus(modelId), {
        enabled: 1,
        disabled_reason: null,
        disabled_at: null,
      });

      restored = true;
      assert.equal(await callModelChatWithFallback(primary, fallback), 'restored');
    });
  } finally {
    getDb().prepare('DELETE FROM models WHERE id = ?').run(modelId);
    getDb().prepare('DELETE FROM model_providers WHERE id = ?').run(providerId);
  }
});

test('connection test alone can probe a quota-disabled model without enabling ordinary calls', async () => {
  const provider = modelProvidersService.createModelProvider({
    name: `connection-provider-${Date.now()}`,
    baseUrl: 'https://primary.test/v1',
    apiKey: 'connection-key',
  });
  const configuredModel = modelsService.createModel({
    providerId: provider.id,
    name: 'primary',
    enabled: true,
  });
  assert.ok(configuredModel);
  const modelId = configuredModel.id;
  let exhausted = true;
  let primaryFetches = 0;
  try {
    await withFetch((url) => {
      if (url.includes('fallback.test')) return openAiResponse('fallback reply');
      primaryFetches += 1;
      return exhausted
        ? openAiResponse(JSON.stringify({
          error: { code: 'AllocationQuota.FreeTierOnly', message: 'Free allocated quota exceeded.' },
        }), 429)
        : openAiResponse('pong');
    }, async () => {
      const primary = model('https://primary.test/v1', 'primary', modelId);
      const fallback = model('https://fallback.test/v1', 'fallback');
      assert.equal(await callModelChatWithFallback(primary, fallback), 'fallback reply');

      exhausted = false;
      const result = await modelsService.testModelConnection(modelId);
      assert.equal(result.ok, true);
      assert.equal(result.message, 'pong');
      assert.equal(readModelStatus(modelId).enabled, 0);

      assert.equal(await callModelChatWithFallback(primary, fallback), 'fallback reply');
    });
    assert.equal(primaryFetches, 2);
  } finally {
    getDb().prepare('DELETE FROM models WHERE id = ?').run(modelId);
    getDb().prepare('DELETE FROM model_providers WHERE id = ?').run(provider.id);
  }
});

test('model service rejects a successful HTTP response with empty model content', async () => {
  const provider = modelProvidersService.createModelProvider({
    name: `empty-response-provider-${Date.now()}`,
    baseUrl: 'https://primary.test/v1',
    apiKey: 'empty-response-key',
  });
  const configuredModel = modelsService.createModel({
    providerId: provider.id,
    name: 'primary',
    enabled: true,
  });
  assert.ok(configuredModel);
  try {
    await withFetch(() => openAiResponse('   '), async () => {
      const result = await modelsService.testModelConnection(configuredModel.id);
      assert.equal(result.ok, false);
      assert.equal(result.message, '模型返回空响应');
    });
  } finally {
    getDb().prepare('DELETE FROM models WHERE id = ?').run(configuredModel.id);
    getDb().prepare('DELETE FROM model_providers WHERE id = ?').run(provider.id);
  }
});
