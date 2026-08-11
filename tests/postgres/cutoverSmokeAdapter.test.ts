import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRequest } from '../../packages/server/smoke/applicationSmokeAdapter';

const PRODUCTION_URL = 'postgresql://consensus_migrator:secret@postgres:5432/consensus?sslmode=verify-full';

test('compiled smoke adapter accepts the fixed production target only for cutover purpose', () => {
  const request = parseRequest(JSON.stringify({
    runId: 'production-cutover',
    targetUrl: PRODUCTION_URL,
    targetSchema: 'consensus',
    purpose: 'production-cutover',
  }), { DATABASE_SSL: 'verify-full', DATABASE_CA_PATH: '/run/secrets/postgres_ca.crt' });
  assert.equal(request.targetSchema, 'consensus');
  assert.equal((request as typeof request & { purpose?: string }).purpose, 'production-cutover');
});

test('compiled smoke adapter keeps production closed to ordinary smoke and rejects identity drift', () => {
  assert.throws(() => parseRequest(JSON.stringify({
    runId: 'ordinary-smoke', targetUrl: PRODUCTION_URL, targetSchema: 'consensus',
  })));
  for (const targetUrl of [
    'postgresql://consensus_app:secret@postgres:5432/consensus?sslmode=verify-full',
    'postgresql://consensus_migrator:secret@wrong-host:5432/consensus?sslmode=verify-full',
    'postgresql://consensus_migrator:secret@postgres:5432/other?sslmode=verify-full',
    'postgresql://consensus_migrator:secret@postgres:5432/consensus?sslmode=require',
  ]) {
    assert.throws(() => parseRequest(JSON.stringify({
      runId: 'production-cutover', targetUrl, targetSchema: 'consensus', purpose: 'production-cutover',
    }), { DATABASE_SSL: 'verify-full', DATABASE_CA_PATH: '/run/secrets/postgres_ca.crt' }));
  }
});
