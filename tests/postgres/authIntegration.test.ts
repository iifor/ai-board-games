import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { setDbExecutorForTests } from '../../packages/server/db';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import { changePassword, login } from '../../packages/server/modules/auth/controller';
import { authMiddleware } from '../../packages/server/modules/auth/middleware';
import * as authRepo from '../../packages/server/modules/auth/repository';
import { hashPasswordSync, signToken, verifyPassword } from '../../packages/server/modules/auth/service';
import { withTestSchema } from './helpers';

function md5(value: string): string {
  return crypto.createHash('md5').update(value).digest('hex');
}

function createResponse(): { response: Response; result: { statusCode: number; body: unknown } } {
  const result = { statusCode: 200, body: undefined as unknown };
  const response = {
    locals: {},
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

async function withAuthDatabase(operation: () => Promise<void>): Promise<void> {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      await operation();
    } finally {
      setDbExecutorForTests(null);
    }
  });
}

test('forced-change admin is rejected from a management API by PostgreSQL-backed auth', async () => {
  await withAuthDatabase(async () => {
    const username = `forced-block-${Date.now()}`;
    const userId = await authRepo.create(
      username,
      hashPasswordSync(md5('initial-password')),
      'Password change test',
      true,
    );
    const { response, result } = createResponse();
    let nextCalled = false;

    await authMiddleware({
      headers: { authorization: `Bearer ${signToken({ sub: userId, username })}` },
      baseUrl: '/api/admin',
      path: '/players',
    } as Request, response, (() => { nextCalled = true; }) as NextFunction);

    assert.equal(nextCalled, false);
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, {
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: '请先修改初始密码',
    });
  });
});

test('password change atomically updates the hash and clears the forced-change flag', async () => {
  await withAuthDatabase(async () => {
    const username = `forced-change-${Date.now()}`;
    const userId = await authRepo.create(
      username,
      hashPasswordSync(md5('initial-password')),
      'Password change test',
      true,
    );
    const { response, result } = createResponse();
    response.locals.user = { id: userId, username, displayName: 'Password change test' };
    const newPassword = md5('new-secure-password');

    await changePassword({ body: { password: newPassword } } as Request, response);

    assert.equal(result.statusCode, 200);
    const stored = await authRepo.findById(userId);
    assert.equal(stored?.must_change_password, 0);
    assert.equal(await verifyPassword(newPassword, stored?.password_hash || ''), true);
  });
});

test('login response returns the persisted forced-change flag', async () => {
  await withAuthDatabase(async () => {
    const username = `forced-login-${Date.now()}`;
    const initialPassword = md5('initial-password');
    await authRepo.create(
      username,
      hashPasswordSync(initialPassword),
      'Password change test',
      true,
    );
    const { response, result } = createResponse();

    await login({
      body: { username, password: initialPassword },
      ip: '203.0.113.60',
    } as Request, response);

    assert.equal(result.statusCode, 200);
    assert.equal(
      (result.body as { data: { mustChangePassword: boolean } }).data.mustChangePassword,
      true,
    );
  });
});

test('sixth failed login is blocked for one client and normalized username', async () => {
  await withAuthDatabase(async () => {
    const username = `unknown-rate-limit-${Date.now()}`;
    const request = {
      body: { username: ` ${username.toUpperCase()} `, password: 'invalid' },
      ip: '203.0.113.61',
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
});

test('six concurrent bad-password logins lose no rate-limit reservations', async () => {
  await withAuthDatabase(async () => {
    const username = `concurrent-rate-limit-${Date.now()}`;
    await authRepo.create(
      username,
      hashPasswordSync(md5('known-password')),
      'Concurrent rate limit test',
    );

    const statuses = await Promise.all(Array.from({ length: 6 }, async () => {
      const { response, result } = createResponse();
      await login({
        body: { username, password: md5('wrong-password') },
        ip: '203.0.113.62',
      } as Request, response);
      return result.statusCode;
    }));

    assert.equal(statuses.filter((status) => status === 401).length, 5);
    assert.equal(statuses.filter((status) => status === 429).length, 1);
  });
});
