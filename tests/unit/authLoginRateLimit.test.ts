import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { login } from '../../packages/server/modules/auth/controller';

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

test('blocks the sixth failed login for one client and normalized username', async () => {
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
