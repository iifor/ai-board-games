import crypto from 'crypto';

interface EncryptedApiKey {
  api_key_cipher?: string;
  api_key_iv?: string;
  api_key_tag?: string;
}

function getSecretKey(): Buffer {
  const apiKeySecret = process.env.API_KEY_SECRET?.trim();
  if (!apiKeySecret && process.env.NODE_ENV === 'production') {
    throw new Error('API_KEY_SECRET is required in production');
  }
  const secret = apiKeySecret || process.env.ADMIN_SECRET?.trim() || 'ai-presenter-local-admin-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptApiKey(value: unknown): EncryptedApiKey {
  const plain = String(value || '').trim();
  if (!plain) return {};
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return {
    api_key_cipher: encrypted.toString('base64'),
    api_key_iv: iv.toString('base64'),
    api_key_tag: cipher.getAuthTag().toString('base64')
  };
}

function decryptApiKey(row: { api_key_cipher?: string; api_key_iv?: string; api_key_tag?: string } | null): string {
  if (!row?.api_key_cipher || !row?.api_key_iv || !row?.api_key_tag) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', getSecretKey(), Buffer.from(row.api_key_iv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.api_key_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(row.api_key_cipher, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

export { getSecretKey, encryptApiKey, decryptApiKey };
export type { EncryptedApiKey };
