import assert from 'node:assert/strict';
import test from 'node:test';
import { getSecretKey } from '../../packages/server/utils/crypto';

test('production API key encryption refuses the local compatibility secret', () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    apiKeySecret: process.env.API_KEY_SECRET,
    adminSecret: process.env.ADMIN_SECRET,
  };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.API_KEY_SECRET;
    process.env.ADMIN_SECRET = 'legacy-admin-secret';
    assert.throws(getSecretKey, /API_KEY_SECRET is required in production/);
    process.env.API_KEY_SECRET = 'dedicated-api-key-secret';
    assert.equal(getSecretKey().length, 32);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.apiKeySecret === undefined) delete process.env.API_KEY_SECRET;
    else process.env.API_KEY_SECRET = previous.apiKeySecret;
    if (previous.adminSecret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = previous.adminSecret;
  }
});
