import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../../packages/server/db/migrations';
import { readAuthConfig } from '../../packages/server/modules/auth/config';
import { seedAdminUser } from '../../packages/server/modules/auth';
import { verifyPassword } from '../../packages/server/modules/auth/service';

test('production auth rejects a missing JWT secret', () => {
  assert.throws(() => readAuthConfig({
    NODE_ENV: 'production',
    ADMIN_USERNAME: 'release-admin',
    ADMIN_PASSWORD: 'a-secure-password',
  }), /JWT_SECRET/);
});

test('production auth rejects weak credentials', () => {
  assert.throws(() => readAuthConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'short',
    ADMIN_USERNAME: 'release-admin',
    ADMIN_PASSWORD: 'short',
  }), /JWT_SECRET|ADMIN_PASSWORD/);
});

test('production auth accepts complete strong credentials', () => {
  const config = readAuthConfig({
    NODE_ENV: 'production',
    JWT_SECRET: '0123456789abcdef0123456789abcdef',
    ADMIN_USERNAME: 'release-admin',
    ADMIN_PASSWORD: 'a-secure-password',
  });

  assert.equal(config.admin?.username, 'release-admin');
});

test('development auth does not invent an administrator', () => {
  assert.equal(readAuthConfig({ NODE_ENV: 'development' }).admin, null);
});

test('admin bootstrap disables legacy accounts and uses configured credentials', async () => {
  const db = new Database(':memory:');
  migrate(db);
  db.prepare("INSERT INTO admin_users (username, password_hash) VALUES ('admin', 'legacy'), ('ifor', 'legacy')").run();

  seedAdminUser(db, { username: 'release-admin', password: 'a-secure-password' });

  const rows = db.prepare('SELECT username, password_hash, enabled FROM admin_users ORDER BY username').all() as Array<{
    username: string;
    password_hash: string;
    enabled: number;
  }>;
  assert.deepEqual(rows.filter((row) => row.enabled === 1).map((row) => row.username), ['release-admin']);
  const current = rows.find((row) => row.username === 'release-admin');
  assert.ok(current);
  const passwordDigest = crypto.createHash('md5').update('a-secure-password').digest('hex');
  assert.equal(await verifyPassword(passwordDigest, current.password_hash), true);
  db.close();
});
