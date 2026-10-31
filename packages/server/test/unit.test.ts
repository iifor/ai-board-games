import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/env';
import { decryptSecret, encryptSecret, hashPassword, maskSecret, verifyPassword } from '../src/utils/crypto';

describe('config', () => {
  const valid = {
    DATABASE_URL: 'postgres://u@h/db',
    JWT_SECRET: 'x'.repeat(32),
    SECRET_KEY: randomBytes(32).toString('base64'),
  };

  it('loads a valid environment with defaults', () => {
    const config = loadConfig(valid);
    expect(config).toMatchObject({ env: 'development', port: 3100, database: { schema: 'public' }, bootstrapAdmin: null });
    expect(config.secretKey).toHaveLength(32);
  });

  it('reports every invalid field without leaking values', () => {
    const secret = 'short-secret';
    expect(() => loadConfig({ ...valid, JWT_SECRET: secret, SECRET_KEY: 'bad', ADMIN_PASSWORD: 'tiny' })).toThrow(ConfigError);
    try {
      loadConfig({ JWT_SECRET: secret });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('JWT_SECRET');
      expect(message).not.toContain(secret);
    }
  });
});

describe('crypto', () => {
  it('hashes and verifies passwords', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('wrong', stored)).toBe(false);
    expect(await verifyPassword('anything', 'garbage')).toBe(false);
  });

  it('encrypts secrets with authentication', () => {
    const key = randomBytes(32);
    const cipher = encryptSecret('sk-live-123456', key);
    expect(cipher).not.toContain('sk-live');
    expect(decryptSecret(cipher, key)).toBe('sk-live-123456');
    expect(() => decryptSecret(cipher, randomBytes(32))).toThrow();
    expect(maskSecret('sk-live-123456')).toBe('****3456');
  });
});
