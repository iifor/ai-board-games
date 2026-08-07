import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { modelToRow, rowToModel } from '../../packages/server/modules/models/utils';
import * as modelRepository from '../../packages/server/modules/models/repository';
import { JsonDb } from '../../packages/server/db/fallback';
import { formatTime } from '../../packages/admin/src/utils/adminHelpers';

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
    disabled_at: '2026-08-07T12:00:00.000Z',
    created_at: '2026-08-07 11:00:00',
    updated_at: '2026-08-07 12:00:00',
  });

  assert.equal(model?.disabledReason, 'quota_exhausted');
  assert.equal(model?.disabledAt, '2026-08-07T12:00:00.000Z');
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

test('JSON fallback persists one quota-disabled model row across restart', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'model-quota-fallback-'));
  const filePath = path.join(directory, 'db.json');
  const jsonDb = new JsonDb(filePath);
  const databaseModule = require('../../packages/server/db') as {
    getDb: () => unknown;
  };
  const originalGetDb = databaseModule.getDb;

  try {
    jsonDb.prepare('INSERT INTO models').run({
      id: 7,
      provider_id: null,
      provider: 'test',
      name: 'quota-model',
      display_name: '',
      base_url: '',
      api_format: 'openai-compatible',
      api_key_cipher: '',
      api_key_iv: '',
      api_key_tag: '',
      thinking_enabled: 0,
      enabled: 1,
      disabled_reason: null,
      disabled_at: null,
      created_at: '2026-08-07T11:00:00.000Z',
      updated_at: '2026-08-07T11:00:00.000Z',
    });
    databaseModule.getDb = () => jsonDb;

    modelRepository.updateModelAvailability(7, false, 'quota_exhausted');

    const restarted = new JsonDb(filePath);
    assert.equal(restarted.data.models.length, 1);
    assert.equal(restarted.data.models[0].id, 7);
    assert.equal(restarted.data.models[0].enabled, 0);
    assert.equal(restarted.data.models[0].disabled_reason, 'quota_exhausted');
    assert.match(
      String(restarted.data.models[0].disabled_at || ''),
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  } finally {
    databaseModule.getDb = originalGetDb;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('admin formats an explicit UTC quota timestamp as Asia/Shanghai local time', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'Asia/Shanghai';
  try {
    assert.match(formatTime('2026-08-07T12:00:00.000Z'), /20:00:00/);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});
