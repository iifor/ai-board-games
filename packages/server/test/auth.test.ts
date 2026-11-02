import { API_ERROR_CODES } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, createTestApp, dataOf, type TestApp } from './support/testApp';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.cleanup());

describe('admin auth', () => {
  it('bootstraps the first admin only once', async () => {
    await t.services.auth.bootstrap();
    expect(await t.services.repositories.auth.count()).toBe(1);
  });

  it('rejects wrong credentials and missing tokens', async () => {
    const wrong = await t.call('POST', '/api/admin/auth/login', { body: { username: ADMIN.username, password: 'nope' } });
    expect(wrong).toMatchObject({ status: 401, body: { code: API_ERROR_CODES.unauthorized } });
    const anonymous = await t.call('GET', '/api/admin/providers');
    expect(anonymous.status).toBe(401);
    const forged = await t.call('GET', '/api/admin/providers', { token: 'not-a-jwt' });
    expect(forged.status).toBe(401);
  });

  it('forces a password change before other admin APIs', async () => {
    const login = dataOf(await t.call<{ token: string; mustChangePassword: boolean }>('POST', '/api/admin/auth/login', { body: ADMIN }));
    expect(login.mustChangePassword).toBe(true);
    const blocked = await t.call('GET', '/api/admin/providers', { token: login.token });
    expect(blocked).toMatchObject({ status: 403, body: { code: API_ERROR_CODES.passwordChangeRequired } });
    const me = dataOf(await t.call<{ username: string }>('GET', '/api/admin/auth/me', { token: login.token }));
    expect(me.username).toBe(ADMIN.username);

    const weak = await t.call('POST', '/api/admin/auth/password', { token: login.token, body: { currentPassword: ADMIN.password, newPassword: 'short' } });
    expect(weak.status).toBe(400);
    const changed = await t.call('POST', '/api/admin/auth/password', {
      token: login.token,
      body: { currentPassword: ADMIN.password, newPassword: 'a-much-better-password' },
    });
    expect(changed.status).toBe(200);
    const allowed = await t.call('GET', '/api/admin/providers', { token: login.token });
    expect(allowed.status).toBe(200);
  });

  it('locks a username after repeated failures', async () => {
    const fresh = await createTestApp();
    try {
      for (let i = 0; i < 10; i += 1) {
        await fresh.call('POST', '/api/admin/auth/login', { body: { username: ADMIN.username, password: `bad-${i}` } });
      }
      const locked = await fresh.call('POST', '/api/admin/auth/login', { body: ADMIN });
      expect(locked).toMatchObject({ status: 429, body: { code: API_ERROR_CODES.tooManyRequests } });
    } finally {
      await fresh.cleanup();
    }
  });

  it('locks per source, so a stranger guessing passwords cannot lock the admin out from another address', async () => {
    const fresh = await createTestApp({ http: { trustProxy: true } });
    try {
      const from = (address: string) => ({ 'x-forwarded-for': address });
      for (let i = 0; i < 10; i += 1) {
        await fresh.call('POST', '/api/admin/auth/login', { body: { username: ADMIN.username, password: `bad-${i}` }, headers: from('203.0.113.9') });
      }
      const stranger = await fresh.call('POST', '/api/admin/auth/login', { body: ADMIN, headers: from('203.0.113.9') });
      expect(stranger).toMatchObject({ status: 429, body: { code: API_ERROR_CODES.tooManyRequests } });
      const admin = await fresh.call('POST', '/api/admin/auth/login', { body: ADMIN, headers: from('198.51.100.7') });
      expect(admin.status).toBe(200);
    } finally {
      await fresh.cleanup();
    }
  });

  it('caps failures per source across usernames', async () => {
    const fresh = await createTestApp({ http: { trustProxy: true } });
    try {
      const headers = { 'x-forwarded-for': '203.0.113.50' };
      for (let i = 0; i < 30; i += 1) {
        const attempt = await fresh.call('POST', '/api/admin/auth/login', { body: { username: `guess-${i}`, password: 'whatever' }, headers });
        expect(attempt.status).toBe(401);
      }
      const capped = await fresh.call('POST', '/api/admin/auth/login', { body: ADMIN, headers });
      expect(capped).toMatchObject({ status: 429, body: { code: API_ERROR_CODES.tooManyRequests } });
      const elsewhere = await fresh.call('POST', '/api/admin/auth/login', { body: ADMIN, headers: { 'x-forwarded-for': '203.0.113.51' } });
      expect(elsewhere.status).toBe(200);
    } finally {
      await fresh.cleanup();
    }
  });
});
