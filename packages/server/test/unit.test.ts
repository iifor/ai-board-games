import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/env';
import { isQuotaExhausted } from '../src/modules/llm';
import { buildAzureSsml } from '../src/modules/tts/azureSsml';
import { azureSpeaker, DEFAULT_VOICES } from '../src/modules/voices';
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
    expect(config).toMatchObject({ ai: { concurrency: 4, maxAttempts: 3 }, realtime: { pollMs: 2000 }, shutdown: { timeoutMs: 10_000 } });
    expect(config.secretKey).toHaveLength(32);
    expect(loadConfig({ ...valid, AI_TASK_MAX_ATTEMPTS: '5', STREAM_POLL_MS: '500' })).toMatchObject({ ai: { maxAttempts: 5 }, realtime: { pollMs: 500 } });
    expect(() => loadConfig({ ...valid, STREAM_POLL_MS: '10' })).toThrow(ConfigError);
  });

  it('reads the shutdown timeout and rejects a negative one', () => {
    expect(loadConfig({ ...valid, SHUTDOWN_TIMEOUT_MS: '2500' })).toMatchObject({ shutdown: { timeoutMs: 2500 } });
    expect(() => loadConfig({ ...valid, SHUTDOWN_TIMEOUT_MS: '-1' })).toThrow(ConfigError);
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

describe('llm quota detection', () => {
  it('only treats 4xx responses with a known billing error code as quota exhaustion', () => {
    expect(isQuotaExhausted(429, { error: { code: 'insufficient_quota', message: 'x' } })).toBe(true);
    expect(isQuotaExhausted(400, { code: 'Arrearage' })).toBe(true);
    expect(isQuotaExhausted(403, { error: { code: 'AllocationQuota.FreeTierOnly' } })).toBe(true);
    expect(isQuotaExhausted(429, { error: { code: 'rate_limit_exceeded' } })).toBe(false);
    expect(isQuotaExhausted(500, { error: { code: 'arrearage' } })).toBe(false);
    expect(isQuotaExhausted(402, 'Payment Required')).toBe(false);
    expect(isQuotaExhausted(402, { error: 'string error' })).toBe(false);
  });
});

describe('azure ssml', () => {
  const voice = { voiceName: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN', style: 'cheerful', rate: '+10%', pitch: '0%' };
  it('applies language, style and prosody and escapes the text', () => {
    const ssml = buildAzureSsml(voice, 'A<B & "C"');
    expect(ssml).toContain('xml:lang="zh-CN"');
    expect(ssml).toContain('<voice name="zh-CN-XiaoxiaoNeural">');
    expect(ssml).toContain('<mstts:express-as style="cheerful"><prosody rate="+10%" pitch="0%">A&lt;B &amp; &quot;C&quot;</prosody></mstts:express-as>');
  });
  it('omits express-as without a style and falls back to neutral prosody', () => {
    const ssml = buildAzureSsml({ ...voice, style: '', rate: '', pitch: '' }, '你好');
    expect(ssml).not.toContain('express-as');
    expect(ssml).toContain('<prosody rate="0%" pitch="0%">你好</prosody>');
  });
});

describe('voice catalog', () => {
  it('has unique names and complete parameters', () => {
    expect(DEFAULT_VOICES.length).toBe(77);
    expect(new Set(DEFAULT_VOICES.map((voice) => voice.name)).size).toBe(DEFAULT_VOICES.length);
    expect(DEFAULT_VOICES.every((voice) => voice.voiceName && voice.language && voice.gender)).toBe(true);
    expect(DEFAULT_VOICES.filter((voice) => voice.provider === 'mimo').every((voice) => voice.style)).toBe(true);
  });
  it('derives a readable speaker label from Azure voice names', () => {
    expect(azureSpeaker('zh-CN-XiaoxiaoNeural')).toBe('Xiaoxiao');
    expect(azureSpeaker('zh-CN-Xiaoxiao:DragonHDFlashLatestNeural')).toBe('Xiaoxiao HD Flash');
    expect(azureSpeaker('zh-CN-liaoning-XiaobeiNeural')).toBe('Xiaobei');
    expect(azureSpeaker('yue-CN-YunSongNeural')).toBe('YunSong');
  });
});
