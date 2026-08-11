import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeBusinessSampleRow,
  businessSampleHash,
} from '../../packages/db-migrator/src/validation/sampleCanonicalization';

test('business sample JSON normalization accepts parsed values and preserves null', () => {
  const fromSqlite = normalizeBusinessSampleRow({
    payload_json: '{"z":[{"b":2,"a":1}],"a":null}',
  }, [], 'serialized');
  const fromPostgres = normalizeBusinessSampleRow({
    payload_json: { a: null, z: [{ a: 1, b: 2 }] },
  });

  assert.deepEqual(fromSqlite, {
    payload_json: { a: null, z: [{ a: 1, b: 2 }] },
  });
  assert.deepEqual(fromPostgres, fromSqlite);
  assert.equal(businessSampleHash(fromPostgres), businessSampleHash(fromSqlite));
  assert.deepEqual(normalizeBusinessSampleRow({ payload_json: null }), { payload_json: null });
});

test('business sample JSON normalization accepts native PostgreSQL scalar values', () => {
  assert.deepEqual(
    normalizeBusinessSampleRow({ value_json: 0.5, enabled_json: true, label_json: '123' }, [], 'parsed'),
    { value_json: 0.5, enabled_json: true, label_json: '123' },
  );
  assert.deepEqual(
    normalizeBusinessSampleRow({ label_json: '"plain-text"' }, [], 'serialized'),
    { label_json: 'plain-text' },
  );
  assert.throws(
    () => normalizeBusinessSampleRow({ label_json: 'malformed-json' }, [], 'serialized'),
    /Unexpected token|JSON/,
  );
});

test('business sample bigint normalization is limited to explicit columns', () => {
  const bigintColumns = ['id', 'model_id'] as const;

  assert.deepEqual(
    normalizeBusinessSampleRow({ id: 7, model_id: null, external_id: '0007' }, bigintColumns),
    { id: '7', model_id: null, external_id: '0007' },
  );
  assert.deepEqual(
    normalizeBusinessSampleRow({ id: '0007', model_id: 42n, external_id: '42' }, bigintColumns),
    { id: '7', model_id: '42', external_id: '42' },
  );
  assert.deepEqual(
    normalizeBusinessSampleRow({ id: '9007199254740993' }, bigintColumns),
    { id: '9007199254740993' },
  );
  assert.deepEqual(
    normalizeBusinessSampleRow({ id: 9007199254740992 }, bigintColumns),
    { id: '[INVALID_BIGINT]' },
  );
});

test('business sample timestamps preserve milliseconds from Date and offset strings', () => {
  assert.deepEqual(
    normalizeBusinessSampleRow({ created_at: new Date('2026-08-10T15:20:11.220Z') }),
    { created_at: '2026-08-10T15:20:11.220Z' },
  );
  assert.deepEqual(
    normalizeBusinessSampleRow({ created_at: '2026-08-10T23:20:11.220+08:00' }),
    { created_at: '2026-08-10T15:20:11.220Z' },
  );
  assert.deepEqual(
    normalizeBusinessSampleRow({ created_at: new Date(Number.NaN), updated_at: 'not-a-date' }),
    { created_at: '[INVALID_TIMESTAMP]', updated_at: '[INVALID_TIMESTAMP]' },
  );
});
