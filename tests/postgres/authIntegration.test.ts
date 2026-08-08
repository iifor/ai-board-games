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

test('forced-password admin login, authorization and password change use PostgreSQL', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      const username = `forced-${Date.now()}`;
      const initialPassword = md5('initial-password');
      const userId = await authRepo.create(
        username,
        hashPasswordSync(initialPassword),
        'Password change test',
        true,
      );

      const loginResponse = createResponse();
      await login({ body: { username, password: initialPassword }, ip: '203.0.113.60' } as Request, loginResponse.response);
      assert.equal(loginResponse.result.statusCode, 200);
      assert.equal((loginResponse.result.body as { data: { mustChangePassword: boolean } }).data.mustChangePassword, true);

      const blockedResponse = createResponse();
      let nextCalled = false;
      await authMiddleware({
        headers: { authorization: `Bearer ${signToken({ sub: userId, username })}` },
        baseUrl: '/api/admin',
        path: '/players',
      } as Request, blockedResponse.response, (() => { nextCalled = true; }) as NextFunction);
      assert.equal(nextCalled, false);
      assert.equal(blockedResponse.result.statusCode, 403);

      const changedResponse = createResponse();
      changedResponse.response.locals.user = { id: userId, username, displayName: 'Password change test' };
      const newPassword = md5('new-secure-password');
      await changePassword({ body: { password: newPassword } } as Request, changedResponse.response);
      assert.equal(changedResponse.result.statusCode, 200);

      const stored = await authRepo.findById(userId);
      assert.equal(stored?.must_change_password, 0);
      assert.equal(await verifyPassword(newPassword, stored?.password_hash || ''), true);
    } finally {
      setDbExecutorForTests(null);
    }
  });
});
