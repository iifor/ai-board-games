import assert from 'node:assert/strict';
import test from 'node:test';
import { setDbExecutorForTests } from '../../packages/server/db';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import {
  callModelChatWithFallback,
  clearQuotaDisabledModel,
} from '../../packages/server/modules/llm/service';
import * as modelRepo from '../../packages/server/modules/models/repository';
import { withTestSchema } from './helpers';

const messages = [{ role: 'user', content: 'hello' }];

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

async function withFetch(handler: (url: string) => Response, operation: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo) => handler(String(input))) as typeof fetch;
  try {
    await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function createModel(name: string): Promise<number> {
  return modelRepo.insertModel({
    provider_id: null, provider: 'test', name, display_name: name,
    base_url: '', api_format: 'openai-compatible', api_key_cipher: '',
    api_key_iv: '', api_key_tag: '', thinking_enabled: 0, enabled: 1,
    disabled_reason: null, disabled_at: null,
  });
}

test('quota exhaustion persists model disable while ordinary rate limiting does not', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    const quotaModelId = await createModel('quota-model');
    const rateModelId = await createModel('rate-model');
    try {
      await withFetch((url) => url.includes('primary.test')
        ? response(JSON.stringify({ error: { code: 'PostpaidBillOverdue' } }), 429)
        : response('fallback'), async () => {
        assert.equal(await callModelChatWithFallback(
          target('https://primary.test/v1', 'primary', quotaModelId),
          target('https://fallback.test/v1', 'fallback'),
        ), 'fallback');
      });
      const quotaStatus = await modelRepo.findModelById(quotaModelId);
      assert.equal(quotaStatus?.enabled, 0);
      assert.equal(quotaStatus?.disabled_reason, 'quota_exhausted');

      await withFetch((url) => url.includes('primary.test')
        ? response(JSON.stringify({ error: { code: 'Throttling.RateQuota' } }), 429)
        : response('fallback'), async () => {
        assert.equal(await callModelChatWithFallback(
          target('https://primary.test/v1', 'primary', rateModelId),
          target('https://fallback.test/v1', 'fallback'),
        ), 'fallback');
      });
      const rateStatus = await modelRepo.findModelById(rateModelId);
      assert.equal(rateStatus?.enabled, 1);
      assert.equal(rateStatus?.disabled_reason, null);
    } finally {
      clearQuotaDisabledModel(quotaModelId);
      clearQuotaDisabledModel(rateModelId);
      setDbExecutorForTests(null);
    }
  });
});
