import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../packages/server/utils/errors';
import { modelToRow, rowToModel } from '../../packages/server/modules/models/utils';
import { createModelSchema, updateModelSchema } from '../../packages/server/modules/models/validator';
import { formatModelLabel } from '../../packages/admin/src/utils/adminHelpers';
import type { ModelRow } from '../../packages/server/types/database';

const existing: ModelRow = {
  id: 1,
  provider_id: 2,
  provider: '阿里云百炼',
  name: 'qwen3.7-plus',
  display_name: 'Qwen3.7 Plus',
  base_url: '',
  api_format: 'openai-compatible',
  api_key_cipher: '',
  api_key_iv: '',
  api_key_tag: '',
  thinking_enabled: 0,
  enabled: 1,
  created_at: '2026-08-06',
  updated_at: '2026-08-06',
};

test('maps the display name without replacing the provider model ID', () => {
  const model = rowToModel(existing);
  assert.equal(model?.name, 'qwen3.7-plus');
  assert.equal(model?.displayName, 'Qwen3.7 Plus');
});

test('trims a supplied display name and preserves it on unrelated updates', () => {
  assert.equal(modelToRow({ displayName: '  Qwen3.7 Plus  ' }, null, existing).display_name, 'Qwen3.7 Plus');
  assert.equal(modelToRow({ enabled: false }, null, existing).display_name, 'Qwen3.7 Plus');
});

test('rejects invalid display names with HTTP 400', () => {
  for (const displayName of [42, 'x'.repeat(121)]) {
    assert.throws(
      () => modelToRow({ displayName } as never, null, existing),
      (error: unknown) => error instanceof AppError && error.httpStatus === 400,
    );
  }
});

test('model request schemas preserve optional display names and reject invalid values', () => {
  const create = createModelSchema.parse({
    providerId: 2,
    name: 'qwen3.7-plus',
    displayName: '  Qwen3.7 Plus  ',
  });
  assert.equal(create.displayName, '  Qwen3.7 Plus  ');
  assert.deepEqual(updateModelSchema.parse({ displayName: '' }), { displayName: '' });
  assert.deepEqual(updateModelSchema.parse({}), {});

  for (const displayName of [42, 'x'.repeat(121)]) {
    assert.equal(createModelSchema.safeParse({ name: 'qwen3.7-plus', displayName }).success, false);
    assert.equal(updateModelSchema.safeParse({ displayName }).success, false);
  }
});

test('model request schemas allow a 120-character display name with outer whitespace', () => {
  const displayName = ` ${'x'.repeat(120)} `;

  assert.equal(
    createModelSchema.safeParse({ name: 'qwen3.7-plus', displayName }).success,
    true,
  );
  assert.equal(updateModelSchema.safeParse({ displayName }).success, true);
});

test('formats a model label once for every admin surface', () => {
  assert.equal(
    formatModelLabel({ name: 'qwen3.7-plus', displayName: 'Qwen3.7 Plus' }),
    'Qwen3.7 Plus（qwen3.7-plus）',
  );
  assert.equal(
    formatModelLabel({ name: 'qwen3.7-plus', displayName: '' }),
    'qwen3.7-plus',
  );
  assert.equal(
    formatModelLabel({ name: 'qwen3.7-plus', displayName: 'qwen3.7-plus' }),
    'qwen3.7-plus',
  );
});
