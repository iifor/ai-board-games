import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from '../../packages/server/db';
import { changePassword, login } from '../../packages/server/modules/auth/controller';
import { authMiddleware } from '../../packages/server/modules/auth/middleware';
import { hashPasswordSync, signToken, verifyPassword } from '../../packages/server/modules/auth/service';

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

function createForcedChangeAdmin(username: string): number {
  const result = getDb().prepare(
    'INSERT INTO admin_users (username, password_hash, display_name, must_change_password) VALUES (?, ?, ?, 1)'
  ).run(username, hashPasswordSync(md5('initial-password')) , 'Password change test');
  return Number(result.lastInsertRowid);
}

test('forced-change admin cannot access a management API', () => {
  const username = `force-change-block-${Date.now()}-${Math.random()}`;
  const userId = createForcedChangeAdmin(username);

  try {
    const { response, result } = createResponse();
    let nextCalled = false;
    authMiddleware({
      headers: { authorization: `Bearer ${signToken({ sub: userId, username })}` },
      path: '/players',
    } as Request, response, (() => { nextCalled = true; }) as NextFunction);

    assert.equal(nextCalled, false);
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, { code: 'PASSWORD_CHANGE_REQUIRED', message: '请先修改初始密码' });
  } finally {
    getDb().prepare('DELETE FROM admin_users WHERE id = ?').run(userId);
  }
});

test('password change clears the forced-change flag and stores the new password', async () => {
  const username = `force-change-reset-${Date.now()}-${Math.random()}`;
  const userId = createForcedChangeAdmin(username);

  try {
    const { response, result } = createResponse();
    response.locals.user = { id: userId, username, displayName: 'Password change test' };
    const newPassword = md5('new-secure-password');

    await changePassword({ body: { password: newPassword } } as Request, response);

    assert.equal(result.statusCode, 200);
    const user = getDb().prepare('SELECT password_hash, must_change_password FROM admin_users WHERE id = ?').get(userId) as {
      password_hash: string;
      must_change_password: number;
    };
    assert.equal(user.must_change_password, 0);
    assert.equal(await verifyPassword(newPassword, user.password_hash), true);
  } finally {
    getDb().prepare('DELETE FROM admin_users WHERE id = ?').run(userId);
  }
});

test('login response reports whether password change is required', async () => {
  const username = `force-change-login-${Date.now()}-${Math.random()}`;
  const userId = createForcedChangeAdmin(username);

  try {
    const { response, result } = createResponse();
    await login({ body: { username, password: md5('initial-password') }, ip: '203.0.113.60' } as Request, response);

    assert.equal(result.statusCode, 200);
    assert.equal((result.body as { data: { mustChangePassword: boolean } }).data.mustChangePassword, true);
  } finally {
    getDb().prepare('DELETE FROM admin_users WHERE id = ?').run(userId);
  }
});

test('admin frontend has a forced password-change route and login redirect', () => {
  const root = process.cwd();
  const pagePath = `${root}/packages/admin/src/pages/ChangePassword/index.tsx`;
  assert.equal(fs.existsSync(pagePath), true);
  assert.match(fs.readFileSync(`${root}/packages/admin/src/pages/Login/index.tsx`, 'utf8'), /mustChangePassword/);
  assert.match(fs.readFileSync(`${root}/packages/admin/src/components/AdminPage/index.tsx`, 'utf8'), /change-password/);
});
