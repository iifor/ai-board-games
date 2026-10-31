import { API_ERROR_CODES, type ModelDto, type PlayerDto, type ProviderDto, type PublicPlayerDto, type VoiceDto } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

let t: TestApp;
let token: string;
beforeAll(async () => {
  t = await createTestApp();
  token = await t.adminToken();
});
afterAll(async () => t.cleanup());

const API_KEY = 'sk-test-secret-987654';

async function createProvider(name = '测试供应商'): Promise<ProviderDto> {
  return dataOf(await t.call<ProviderDto>('POST', '/api/admin/providers', { token, body: { name, baseUrl: 'https://api.example.com/v1', apiKey: API_KEY } }));
}

async function createModel(providerId: number, name: string, extra: Record<string, unknown> = {}): Promise<ModelDto> {
  return dataOf(await t.call<ModelDto>('POST', '/api/admin/models', { token, body: { providerId, name, model: 'gpt-x', ...extra } }));
}

describe('model providers', () => {
  it('stores the API key encrypted and only returns a mask', async () => {
    const created = await createProvider();
    expect(created.apiKeyMasked).toBe('****7654');
    const listed = dataOf(await t.call<ProviderDto[]>('GET', '/api/admin/providers', { token }));
    expect(JSON.stringify(listed)).not.toContain(API_KEY);
    const row = await t.services.repositories.providers.find(created.id);
    expect(row?.apiKeyEncrypted).not.toContain(API_KEY);
    expect((await t.services.providers.credentials(created.id)).apiKey).toBe(API_KEY);
  });

  it('keeps the key when updating without one', async () => {
    const created = await createProvider('保留密钥');
    const updated = dataOf(await t.call<ProviderDto>('PUT', `/api/admin/providers/${created.id}`, {
      token,
      body: { name: '保留密钥', baseUrl: 'https://other.example.com', enabled: false },
    }));
    expect(updated).toMatchObject({ baseUrl: 'https://other.example.com', enabled: false, apiKeyMasked: '****7654' });
  });

  it('validates input and rejects duplicates', async () => {
    const invalid = await t.call('POST', '/api/admin/providers', { token, body: { name: '', baseUrl: 'ftp://x', apiKey: '' } });
    expect(invalid).toMatchObject({ status: 400, body: { code: API_ERROR_CODES.validation } });
    await createProvider('重名');
    const duplicate = await t.call('POST', '/api/admin/providers', { token, body: { name: '重名', baseUrl: 'https://a.com', apiKey: 'k' } });
    expect(duplicate).toMatchObject({ status: 409, body: { code: API_ERROR_CODES.conflict } });
  });
});

describe('models, voices and players', () => {
  it('checks references and protects resources still in use', async () => {
    const provider = await createProvider('模型供应商');
    const missingProvider = await t.call('POST', '/api/admin/models', { token, body: { providerId: 99999, name: 'x', model: 'm' } });
    expect(missingProvider.status).toBe(400);
    const primary = await createModel(provider.id, '主模型', { temperature: 0.3, maxTokens: 512 });
    expect(primary).toMatchObject({ temperature: 0.3, maxTokens: 512, fallbackModelId: null });
    const backup = await createModel(provider.id, '备用模型');
    const linked = dataOf(await t.call<ModelDto>('PUT', `/api/admin/models/${primary.id}`, {
      token,
      body: { providerId: provider.id, name: '主模型', model: 'gpt-x', fallbackModelId: backup.id },
    }));
    expect(linked.fallbackModelId).toBe(backup.id);
    const self = await t.call('PUT', `/api/admin/models/${primary.id}`, { token, body: { providerId: provider.id, name: '主模型', model: 'gpt-x', fallbackModelId: primary.id } });
    expect(self.status).toBe(400);

    const voice = dataOf(await t.call<VoiceDto>('POST', '/api/admin/voices', { token, body: { name: '晓晓', provider: 'azure', voiceName: 'zh-CN-XiaoxiaoNeural' } }));
    const player = dataOf(await t.call<PlayerDto>('POST', '/api/admin/players', {
      token,
      body: { name: '阿明', persona: '谨慎的分析派', modelId: primary.id, voiceId: voice.id },
    }));
    expect(player).toMatchObject({ name: '阿明', voiceId: voice.id, enabled: true, avatar: null });

    const inUse = await t.call('DELETE', `/api/admin/models/${primary.id}`, { token });
    expect(inUse).toMatchObject({ status: 409, body: { code: API_ERROR_CODES.conflict } });
    const providerInUse = await t.call('DELETE', `/api/admin/providers/${provider.id}`, { token });
    expect(providerInUse.status).toBe(409);
  });

  it('lists only enabled players publicly, without model details', async () => {
    const provider = await createProvider('公开列表');
    const model = await createModel(provider.id, '公开模型');
    await t.call('POST', '/api/admin/players', { token, body: { name: '可见', modelId: model.id } });
    await t.call('POST', '/api/admin/players', { token, body: { name: '隐藏', modelId: model.id, enabled: false } });
    const listed = dataOf(await t.call<PublicPlayerDto[]>('GET', '/api/toc/players'));
    expect(listed.map((player) => player.name)).toContain('可见');
    expect(listed.map((player) => player.name)).not.toContain('隐藏');
    expect(Object.keys(listed[0] ?? {})).toEqual(['id', 'name', 'avatar', 'persona']);
  });

  it('returns 404 for missing resources and rejects bad ids', async () => {
    expect((await t.call('GET', '/api/admin/players/424242', { token })).status).toBe(404);
    expect((await t.call('GET', '/api/admin/players/abc', { token })).status).toBe(400);
    expect((await t.call('DELETE', '/api/admin/voices/424242', { token })).status).toBe(404);
  });
});
