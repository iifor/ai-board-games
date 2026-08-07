import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { modelToRow, rowToModel } from '../../packages/server/modules/models/utils';

test('maps persisted quota status to the model API', () => {
  const model = rowToModel({
    id: 1,
    provider_id: 2,
    provider: 'aliyun',
    name: 'qwen-plus',
    display_name: 'Qwen Plus',
    base_url: '',
    api_format: 'openai-compatible',
    api_key_cipher: '',
    api_key_iv: '',
    api_key_tag: '',
    enabled: 0,
    thinking_enabled: 0,
    disabled_reason: 'quota_exhausted',
    disabled_at: '2026-08-07 12:00:00',
    created_at: '2026-08-07 11:00:00',
    updated_at: '2026-08-07 12:00:00',
  });

  assert.equal(model?.disabledReason, 'quota_exhausted');
  assert.equal(model?.disabledAt, '2026-08-07 12:00:00');
});

test('preserves quota status on unrelated edits and clears it on explicit enable changes', () => {
  const existing = {
    id: 1,
    provider_id: 2,
    provider: 'aliyun',
    name: 'qwen-plus',
    display_name: 'Qwen Plus',
    base_url: '',
    api_format: 'openai-compatible',
    api_key_cipher: '',
    api_key_iv: '',
    api_key_tag: '',
    enabled: 0,
    thinking_enabled: 0,
    disabled_reason: 'quota_exhausted',
    disabled_at: '2026-08-07 12:00:00',
    created_at: '2026-08-07 11:00:00',
    updated_at: '2026-08-07 12:00:00',
  } as const;

  assert.equal(modelToRow({ displayName: 'Renamed' }, null, existing).disabled_reason, 'quota_exhausted');
  assert.equal(modelToRow({ enabled: true }, null, existing).disabled_reason, null);
  assert.equal(modelToRow({ enabled: false }, null, existing).disabled_reason, null);
});

test('admin shows exhausted status and tests before enabling', () => {
  const source = fs.readFileSync(
    path.resolve('packages/admin/src/pages/ModelManager/index.tsx'),
    'utf8',
  );
  assert.match(source, /额度已用完/);
  assert.match(source, /disabledReason === 'quota_exhausted'/);
  const testCall = source.indexOf('/test');
  const enableCall = source.indexOf('JSON.stringify({ enabled: true })');
  assert.ok(testCall >= 0 && enableCall > testCall);
});
