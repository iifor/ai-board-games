import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import type { Request, Response } from 'express';
import { login } from '../../packages/server/modules/auth/controller';
import { getDb } from '../../packages/server/db';
import { hashPasswordSync } from '../../packages/server/modules/auth/service';

function createResponse(): { response: Response; result: { statusCode: number; body: unknown } } {
  const result = { statusCode: 200, body: undefined as unknown };
  const response = {
    status(statusCode: number) {
      result.statusCode = statusCode;
      return response;
    },
    json(body: unknown) {
      result.body = body;
      return response;
    },
  } as unknown as Response;
  return { response, result };
}

test.skip('blocks the sixth failed login for one client and normalized username (covered by PostgreSQL auth integration)', async () => {
  const username = `unknown-rate-limit-${Date.now()}`;
  const request = {
    body: { username: ` ${username.toUpperCase()} `, password: 'invalid' },
    ip: '203.0.113.10',
  } as Request;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { response, result } = createResponse();
    await login(request, response);
    assert.equal(result.statusCode, 401);
  }

  const { response, result } = createResponse();
  await login(request, response);

  assert.equal(result.statusCode, 429);
  assert.ok((result.body as { data: { retryAfterSeconds: number } }).data.retryAfterSeconds > 0);
});

test.skip('blocks one of six concurrent bad-password logins for an enabled admin (covered by PostgreSQL auth integration)', async () => {
  const username = `concurrent-rate-limit-${Date.now()}-${Math.random()}`;
  const passwordHash = hashPasswordSync(crypto.createHash('md5').update('known-password').digest('hex'));
  getDb().prepare('INSERT INTO admin_users (username, password_hash, display_name) VALUES (?, ?, ?)')
    .run(username, passwordHash, 'Concurrent rate limit test');

  try {
    const statuses = await Promise.all(Array.from({ length: 6 }, async () => {
      const { response, result } = createResponse();
      await login({
        body: { username, password: crypto.createHash('md5').update('wrong-password').digest('hex') },
        ip: '203.0.113.11',
      } as Request, response);
      return result.statusCode;
    }));

    assert.equal(statuses.filter((status) => status === 401).length, 5);
    assert.equal(statuses.filter((status) => status === 429).length, 1);
  } finally {
    getDb().prepare('DELETE FROM admin_users WHERE username = ?').run(username);
  }
});
