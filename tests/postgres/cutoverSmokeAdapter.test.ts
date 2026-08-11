import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRequest } from '../../packages/server/smoke/applicationSmokeAdapter';
import { productionDatabaseUrl, productionTlsEnvironment } from './cutoverTestHelpers';

test('compiled smoke adapter accepts the fixed production target only for cutover purpose', () => {
  const request = parseRequest(JSON.stringify({
    runId: 'production-cutover',
    targetUrl: productionDatabaseUrl(),
    targetSchema: 'consensus',
    purpose: 'production-cutover',
  }), productionTlsEnvironment('/run/secrets/postgres_ca.crt'));
  assert.equal(request.targetSchema, 'consensus');
  assert.equal((request as typeof request & { purpose?: string }).purpose, 'production-cutover');
});

test('compiled smoke adapter keeps production closed to ordinary smoke and rejects identity drift', () => {
  assert.throws(() => parseRequest(JSON.stringify({
    runId: 'ordinary-smoke', targetUrl: productionDatabaseUrl(), targetSchema: 'consensus',
  })));
  for (const targetUrl of [
    productionDatabaseUrl({ role: 'consensus_app' }),
    productionDatabaseUrl({ host: 'wrong-host' }),
    productionDatabaseUrl({ database: 'other' }),
  ]) {
    assert.throws(() => parseRequest(JSON.stringify({
      runId: 'production-cutover', targetUrl, targetSchema: 'consensus', purpose: 'production-cutover',
    }), productionTlsEnvironment('/run/secrets/postgres_ca.crt')));
  }
  assert.throws(() => parseRequest(JSON.stringify({
    runId: 'production-cutover', targetUrl: productionDatabaseUrl(),
    targetSchema: 'consensus', purpose: 'production-cutover',
  }), { DATABASE_SSL: 'require', DATABASE_CA_PATH: '/run/secrets/postgres_ca.crt' }));
});
