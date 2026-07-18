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

test('admin bootstrap creates the configured account with forced password change only for an empty table', async () => {
  const db = new Database(':memory:');
  migrate(db);

  seedAdminUser(db, { username: 'release-admin', password: 'a-secure-password' });

  const rows = db.prepare('SELECT username, password_hash, enabled, must_change_password FROM admin_users').all() as Array<{
    username: string;
    password_hash: string;
    enabled: number;
    must_change_password: number;
  }>;
  assert.equal(rows.length, 1);
  const current = rows[0];
  assert.ok(current);
  assert.equal(current.username, 'release-admin');
  assert.equal(current.must_change_password, 1);
  const passwordDigest = crypto.createHash('md5').update('a-secure-password').digest('hex');
  assert.equal(await verifyPassword(passwordDigest, current.password_hash), true);
  db.close();
});

test('admin bootstrap leaves every existing account unchanged', () => {
  const db = new Database(':memory:');
  migrate(db);
  db.prepare("INSERT INTO admin_users (username, password_hash, enabled) VALUES ('legacy', 'legacy-hash', 1)").run();

  seedAdminUser(db, { username: 'release-admin', password: 'a-secure-password' });

  const rows = db.prepare('SELECT username, password_hash, enabled FROM admin_users').all();
  assert.deepEqual(rows, [{ username: 'legacy', password_hash: 'legacy-hash', enabled: 1 }]);
  db.close();
});
