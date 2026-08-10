import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { setDbExecutorForTests } from '../../packages/server/db';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import {
  callModelChatWithFallback,
  clearQuotaDisabledModel,
} from '../../packages/server/modules/llm/service';
import * as modelRepo from '../../packages/server/modules/models/repository';
import * as modelsService from '../../packages/server/modules/models/service';
import * as modelProvidersService from '../../packages/server/modules/model-providers/service';
import { upstreamConcurrency } from '../../packages/server/utils/concurrency';
import { withTestSchema } from './helpers';

const messages = [{ role: 'user', content: 'hello' }];
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function target(baseUrl: string, name: string, modelId?: number) {
  return {
    apiKey: `${name}-key`, baseUrl, provider: name, model: name, modelId,
    apiFormat: 'openai-compatible', messages,
  };
}

function response(content: string, status = 200): Response {
  return new Response(
    status === 200 ? JSON.stringify({ choices: [{ message: { content } }] }) : content,
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

let fetchTail = Promise.resolve();

async function withFetch(
  handler: (url: string) => Response | Promise<Response>,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = fetchTail;
  let release!: () => void;
  fetchTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo) => handler(String(input))) as typeof fetch;
  try {
    await operation();
  } finally {
    globalThis.fetch = originalFetch;
    release();
  }
}

interface QuotaTestContext {
  createModel(name: string, providerId?: number | null): Promise<number>;
  trackModel(modelId: number): number;
}

let quotaTestTail = Promise.resolve();

async function withQuotaDatabase(operation: (context: QuotaTestContext) => Promise<void>): Promise<void> {
  const previous = quotaTestTail;
  let release!: () => void;
  quotaTestTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    await withTestSchema(async (database) => {
      await migratePostgres(database);
      setDbExecutorForTests(database);
      const modelIds = new Set<number>();
      const trackModel = (modelId: number) => {
        modelIds.add(modelId);
        clearQuotaDisabledModel(modelId);
        return modelId;
      };
      try {
        await operation({
          trackModel,
          createModel: async (name, providerId = null) => trackModel(await modelRepo.insertModel({
            provider_id: providerId, provider: 'test', name, display_name: name,
            base_url: '', api_format: 'openai-compatible', api_key_cipher: '',
            api_key_iv: '', api_key_tag: '', thinking_enabled: 0, enabled: 1,
            disabled_reason: null, disabled_at: null,
          })),
        });
      } finally {
        for (const modelId of modelIds) clearQuotaDisabledModel(modelId);
        setDbExecutorForTests(null);
      }
    });
  } finally {
    release();
  }
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  message: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
}

describe('PostgreSQL LLM quota integration', { concurrency: false }, () => {
test('quota exhaustion persists disable state and skips later primary fetches', async () => {
  await withQuotaDatabase(async ({ createModel }) => {
    const modelId = await createModel(`quota-exhausted-${Date.now()}`);
    const urls: string[] = [];

    await withFetch((url) => {
      urls.push(url);
      return url.includes('primary.test')
        ? response(JSON.stringify({
          error: { code: 'PostpaidBillOverdue', message: 'The postpaid bill is overdue.' },
        }), 429)
        : response('fallback reply');
    }, async () => {
      const primary = target('https://primary.test/v1', 'primary', modelId);
      const fallback = target('https://fallback.test/v1', 'fallback');
      assert.equal(await callModelChatWithFallback(primary, fallback), 'fallback reply');

      const exhausted = await modelRepo.findModelById(modelId);
      assert.equal(exhausted?.enabled, 0);
      assert.equal(exhausted?.disabled_reason, 'quota_exhausted');
      assert.match(exhausted?.disabled_at || '', ISO_TIMESTAMP);

      const apiModel = await modelsService.getModel(modelId);
      assert.match(apiModel?.disabledAt || '', ISO_TIMESTAMP);
      assert.match(apiModel?.createdAt || '', ISO_TIMESTAMP);
      assert.match(apiModel?.updatedAt || '', ISO_TIMESTAMP);

      assert.equal(await callModelChatWithFallback(primary, fallback), 'fallback reply');
    });

    assert.deepEqual(urls, [
      'https://primary.test/v1/chat/completions',
      'https://fallback.test/v1/chat/completions',
      'https://fallback.test/v1/chat/completions',
    ]);
  });
});

test('ordinary 429 rate limiting does not disable the model', async () => {
  await withQuotaDatabase(async ({ createModel }) => {
    const modelId = await createModel(`rate-limited-${Date.now()}`);

    await withFetch((url) => url.includes('primary.test')
      ? response(JSON.stringify({
        error: {
          code: 'Throttling.RateQuota',
          message: 'Requests rate limit exceeded, please try again later.',
        },
      }), 429)
      : response('fallback reply'), async () => {
      assert.equal(await callModelChatWithFallback(
        target('https://primary.test/v1', 'primary', modelId),
        target('https://fallback.test/v1', 'fallback'),
      ), 'fallback reply');
    });

    const limited = await modelRepo.findModelById(modelId);
    assert.equal(limited?.enabled, 1);
    assert.equal(limited?.disabled_reason, null);
    assert.equal(limited?.disabled_at, null);
  });
});

test('queued LLM work rechecks quota state after acquiring limiter capacity', async () => {
  await withQuotaDatabase(async ({ createModel }) => {
    const modelId = await createModel(`queued-quota-${Date.now()}`);
    const limit = upstreamConcurrency.llmLimiter.stats().limit;
    let primaryFetches = 0;
    let releaseQuotaResponse = () => {};
    let releaseOtherResponses = () => {};
    const quotaResponseGate = new Promise<void>((resolve) => { releaseQuotaResponse = resolve; });
    const otherResponsesGate = new Promise<void>((resolve) => { releaseOtherResponses = resolve; });

    try {
      let queuedReply = '';
      await withFetch(async (url) => {
        if (url.includes('fallback.test')) return response('fallback reply');
        primaryFetches += 1;
        if (primaryFetches === 1) {
          await quotaResponseGate;
          return response(JSON.stringify({
            error: { code: 'PostpaidBillOverdue', message: 'The postpaid bill is overdue.' },
          }), 429);
        }
        await otherResponsesGate;
        return response('already-started primary reply');
      }, async () => {
        const primary = target('https://primary.test/v1', 'primary', modelId);
        const fallback = target('https://fallback.test/v1', 'fallback');
        const activeCalls = Array.from(
          { length: limit },
          () => callModelChatWithFallback(primary, fallback),
        );

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
        await waitFor(async () => (await modelRepo.findModelById(modelId))?.enabled === 0,
          'expected quota exhaustion to persist before releasing other calls');
        releaseOtherResponses();
        [queuedReply] = await Promise.all([queuedCall, Promise.all(activeCalls).then(() => '')]);
      });

      assert.equal(queuedReply, 'fallback reply');
      assert.equal(primaryFetches, limit);
    } finally {
      releaseQuotaResponse();
      releaseOtherResponses();
    }
  });
});

test('fallback quota exhaustion disables both configured models', async () => {
  await withQuotaDatabase(async ({ createModel }) => {
    const primaryId = await createModel(`primary-quota-${Date.now()}`);
    const fallbackId = await createModel(`fallback-quota-${Date.now()}`);

    await withFetch(() => response(JSON.stringify({
      error: {
        code: 'AllocationQuota.FreeTierOnly',
        message: 'Free allocated quota exceeded.',
      },
    }), 429), async () => {
      await assert.rejects(callModelChatWithFallback(
        target('https://primary.test/v1', 'primary', primaryId),
        target('https://fallback.test/v1', 'fallback', fallbackId),
      ), AggregateError);
    });

    for (const modelId of [primaryId, fallbackId]) {
      const exhausted = await modelRepo.findModelById(modelId);
      assert.equal(exhausted?.enabled, 0);
      assert.equal(exhausted?.disabled_reason, 'quota_exhausted');
      assert.ok(exhausted?.disabled_at);
    }
  });
});

test('non-quota failures leave model availability unchanged', async () => {
  await withQuotaDatabase(async ({ createModel }) => {
    const cases = [
      ['server error', () => response('upstream failed', 500)],
      ['validation error', () => response('invalid request', 400)],
      ['unrelated 400 balance message', () => response(JSON.stringify({
        error: { code: 'BadRequest', message: 'The prompt quotes 余额不足.' },
      }), 400)],
      ['unrelated 403 balance message', () => response(JSON.stringify({
        error: { code: 'PermissionDenied', message: 'The prompt quotes insufficient balance.' },
      }), 403)],
      ['network error', () => { throw new TypeError('fetch failed'); }],
    ] as const;

    for (const [name, failure] of cases) {
      const modelId = await createModel(`non-quota-${name}-${Date.now()}`);
      await withFetch((url) => url.includes('primary.test')
        ? failure()
        : response('fallback reply'), async () => {
        assert.equal(await callModelChatWithFallback(
          target('https://primary.test/v1', 'primary', modelId),
          target('https://fallback.test/v1', 'fallback'),
        ), 'fallback reply');
      });
      const available = await modelRepo.findModelById(modelId);
      assert.equal(available?.enabled, 1);
      assert.equal(available?.disabled_reason, null);
      assert.equal(available?.disabled_at, null);
    }
  });
});

test('manual re-enable clears quota state and permits a restored provider call', async () => {
  await withQuotaDatabase(async ({ trackModel }) => {
    const provider = await modelProvidersService.createModelProvider({
      name: `recovery-provider-${Date.now()}`,
      baseUrl: 'https://primary.test/v1',
      apiKey: 'recovery-key',
    });
    const configured = await modelsService.createModel({
      providerId: provider.id,
      name: 'primary',
      enabled: true,
    });
    assert.ok(configured);
    const modelId = trackModel(configured.id);
    let restored = false;

    await withFetch((url) => {
      if (!url.includes('primary.test')) return response('fallback reply');
      return restored
        ? response('restored')
        : response(JSON.stringify({
          error: { code: 'AllocationQuota.FreeTierOnly', message: 'Free allocated quota exceeded.' },
        }), 429);
    }, async () => {
      const primary = target('https://primary.test/v1', 'primary', modelId);
      const fallback = target('https://fallback.test/v1', 'fallback');
      assert.equal(await callModelChatWithFallback(primary, fallback), 'fallback reply');

      await modelsService.updateModel(modelId, { enabled: true });
      const enabled = await modelRepo.findModelById(modelId);
      assert.equal(enabled?.enabled, 1);
      assert.equal(enabled?.disabled_reason, null);
      assert.equal(enabled?.disabled_at, null);

      restored = true;
      assert.equal(await callModelChatWithFallback(primary, fallback), 'restored');
    });
  });
});

test('connection test probes a quota-disabled model without enabling ordinary calls', async () => {
  await withQuotaDatabase(async ({ trackModel }) => {
    const provider = await modelProvidersService.createModelProvider({
      name: `connection-provider-${Date.now()}`,
      baseUrl: 'https://primary.test/v1',
      apiKey: 'connection-key',
    });
    const configured = await modelsService.createModel({
      providerId: provider.id,
      name: 'primary',
      enabled: true,
    });
    assert.ok(configured);
    const modelId = trackModel(configured.id);
    let exhausted = true;
    let primaryFetches = 0;

    await withFetch((url) => {
      if (url.includes('fallback.test')) return response('fallback reply');
      primaryFetches += 1;
      return exhausted
        ? response(JSON.stringify({
          error: { code: 'AllocationQuota.FreeTierOnly', message: 'Free allocated quota exceeded.' },
        }), 429)
        : response('pong');
    }, async () => {
      const primary = target('https://primary.test/v1', 'primary', modelId);
      const fallback = target('https://fallback.test/v1', 'fallback');
      assert.equal(await callModelChatWithFallback(primary, fallback), 'fallback reply');

      exhausted = false;
      const result = await modelsService.testModelConnection(modelId);
      assert.equal(result.ok, true);
      assert.equal(result.message, 'pong');
      assert.equal((await modelRepo.findModelById(modelId))?.enabled, 0);

      assert.equal(await callModelChatWithFallback(primary, fallback), 'fallback reply');
    });
    assert.equal(primaryFetches, 2);
  });
});

test('connection test rejects a successful response with empty model content', async () => {
  await withQuotaDatabase(async ({ trackModel }) => {
    const provider = await modelProvidersService.createModelProvider({
      name: `empty-response-provider-${Date.now()}`,
      baseUrl: 'https://primary.test/v1',
      apiKey: 'empty-response-key',
    });
    const configured = await modelsService.createModel({
      providerId: provider.id,
      name: 'primary',
      enabled: true,
    });
    assert.ok(configured);
    trackModel(configured.id);

    await withFetch(() => response('   '), async () => {
      const result = await modelsService.testModelConnection(configured.id);
      assert.equal(result.ok, false);
      assert.equal(result.message, '模型返回空响应');
    });
  });
});
});
