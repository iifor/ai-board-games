import {
  API_ERROR_CODES, type ModelDto, type ModelTestResult, type PlayerDto, type ProviderDto, type PublicPlayerDto,
  type VoiceDto, type VoiceImportResult, type VoicePreviewResult,
} from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LlmError, type LlmClient } from '../src/modules/llm';
import { DEFAULT_VOICES } from '../src/modules/voices';
import { fakeTts } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

/** 连接测试用的假模型：按模型 ID 决定回 JSON、回纯文本还是报错 */
function connectionLlm(): LlmClient {
  return {
    complete: async (request) => {
      if (request.model.includes('broken')) throw new LlmError('模型返回 401：Incorrect API key', false);
      if (request.model.includes('text')) return { content: 'pong', usage: null };
      return { content: '{"pong":true}', usage: null };
    },
  };
}

let t: TestApp;
let token: string;
const tts = fakeTts();
beforeAll(async () => {
  t = await createTestApp({}, { llm: connectionLlm(), ttsProviders: { azure: tts } });
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
    expect(created).toMatchObject({ apiKeyMasked: '****7654', modelCount: 0 });
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
    expect(dataOf(await t.call<ProviderDto>('GET', `/api/admin/providers/${provider.id}`, { token })).modelCount).toBe(2);

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

describe('model connection test and quota status', () => {
  it('tests the connection and reports failures in the result instead of throwing', async () => {
    const provider = await createProvider('连接测试');
    const good = await createModel(provider.id, '可用模型');
    const ok = dataOf(await t.call<ModelTestResult>('POST', `/api/admin/models/${good.id}/test`, { token }));
    expect(ok.ok).toBe(true);
    expect(ok.message).toContain('JSON 输出正常');
    const text = await createModel(provider.id, '纯文本模型', { model: 'text-model' });
    expect(dataOf(await t.call<ModelTestResult>('POST', `/api/admin/models/${text.id}/test`, { token })).message).toContain('不是 JSON');
    const broken = await createModel(provider.id, '坏模型', { model: 'broken-model' });
    const failed = dataOf(await t.call<ModelTestResult>('POST', `/api/admin/models/${broken.id}/test`, { token }));
    expect(failed.ok).toBe(false);
    expect(failed.message).toContain('401');
    expect((await t.call('POST', '/api/admin/models/424242/test', { token })).status).toBe(404);
  });

  it('keeps the quota flag while disabled and clears it when an admin re-enables the model', async () => {
    const provider = await createProvider('额度');
    const model = await createModel(provider.id, '额度模型');
    await t.services.models.markQuotaExhausted(model.id);
    const disabled = await t.services.models.get(model.id);
    expect(disabled).toMatchObject({ enabled: false, disabledReason: 'quota_exhausted' });
    expect(disabled.disabledAt).not.toBeNull();
    const body = { providerId: provider.id, name: '额度模型', model: 'gpt-x' };
    const kept = dataOf(await t.call<ModelDto>('PUT', `/api/admin/models/${model.id}`, { token, body: { ...body, enabled: false } }));
    expect(kept.disabledReason).toBe('quota_exhausted');
    const enabled = dataOf(await t.call<ModelDto>('PUT', `/api/admin/models/${model.id}`, { token, body: { ...body, enabled: true } }));
    expect(enabled).toMatchObject({ enabled: true, disabledReason: null, disabledAt: null });
  });

  it('keeps a quota-disabled model disabled when an update omits enabled', async () => {
    const provider = await createProvider('额度保留');
    const model = await createModel(provider.id, '额度保留模型');
    await t.services.models.markQuotaExhausted(model.id);
    const body = { providerId: provider.id, name: '改了名字', model: 'gpt-y' };
    const updated = dataOf(await t.call<ModelDto>('PUT', `/api/admin/models/${model.id}`, { token, body }));
    expect(updated).toMatchObject({ name: '改了名字', model: 'gpt-y', enabled: false, disabledReason: 'quota_exhausted' });
    expect(updated.disabledAt).not.toBeNull();
    // 创建时省略 enabled 仍默认启用
    expect((await createModel(provider.id, '默认启用')).enabled).toBe(true);
  });
});

describe('enabled is preserved on update when omitted', () => {
  it('for providers, voices and players', async () => {
    const provider = await createProvider('停用保留');
    await t.call('PUT', `/api/admin/providers/${provider.id}`, { token, body: { name: '停用保留', baseUrl: 'https://api.example.com/v1', enabled: false } });
    const providerKept = dataOf(await t.call<ProviderDto>('PUT', `/api/admin/providers/${provider.id}`, { token, body: { name: '停用保留2', baseUrl: 'https://api.example.com/v1' } }));
    expect(providerKept).toMatchObject({ name: '停用保留2', enabled: false });

    const voice = dataOf(await t.call<VoiceDto>('POST', '/api/admin/voices', { token, body: { name: '停用音色', provider: 'browser', voiceName: 'zh-CN', enabled: false } }));
    const voiceKept = dataOf(await t.call<VoiceDto>('PUT', `/api/admin/voices/${voice.id}`, { token, body: { name: '停用音色', provider: 'browser', voiceName: 'zh-TW' } }));
    expect(voiceKept).toMatchObject({ voiceName: 'zh-TW', enabled: false });
    const voiceOn = dataOf(await t.call<VoiceDto>('PUT', `/api/admin/voices/${voice.id}`, { token, body: { name: '停用音色', provider: 'browser', voiceName: 'zh-TW', enabled: true } }));
    expect(voiceOn.enabled).toBe(true);

    const model = await createModel(provider.id, '玩家用模型');
    const player = dataOf(await t.call<PlayerDto>('POST', '/api/admin/players', { token, body: { name: '停用玩家', modelId: model.id, enabled: false } }));
    const playerKept = dataOf(await t.call<PlayerDto>('PUT', `/api/admin/players/${player.id}`, { token, body: { name: '停用玩家改名', modelId: model.id } }));
    expect(playerKept).toMatchObject({ name: '停用玩家改名', enabled: false });
  });
});

describe('voice parameters, preview and catalog import', () => {
  it('stores voice parameters and previews through the configured TTS provider', async () => {
    const voice = dataOf(await t.call<VoiceDto>('POST', '/api/admin/voices', {
      token,
      body: { name: '试听音色', provider: 'azure', voiceName: 'zh-CN-XiaoxiaoNeural', gender: '女', style: 'cheerful', rate: '+10%', sampleText: '大家好' },
    }));
    expect(voice).toMatchObject({ language: 'zh-CN', gender: '女', style: 'cheerful', rate: '+10%', pitch: '0%', sampleText: '大家好' });
    const badRate = await t.call('POST', '/api/admin/voices', { token, body: { name: '坏语速', provider: 'azure', voiceName: 'x', rate: 'fast' } });
    expect(badRate).toMatchObject({ status: 400, body: { code: API_ERROR_CODES.validation } });

    const preview = dataOf(await t.call<VoicePreviewResult>('POST', `/api/admin/voices/${voice.id}/preview`, { token, body: {} }));
    expect(preview.url).toMatch(/^\/api\/media\/[0-9a-f]{40}$/);
    expect(tts.texts).toContain('大家好');
    const media = await t.app.request(preview.url);
    expect(media.status).toBe(200);
    expect(await media.text()).toBe('audio:大家好');
    const custom = dataOf(await t.call<VoicePreviewResult>('POST', `/api/admin/voices/${voice.id}/preview`, { token, body: { text: '自定义文本' } }));
    expect(custom.url).not.toBe(preview.url);

    const browser = dataOf(await t.call<VoiceDto>('POST', '/api/admin/voices', { token, body: { name: '本地朗读', provider: 'browser', voiceName: 'zh-CN' } }));
    expect((await t.call('POST', `/api/admin/voices/${browser.id}/preview`, { token, body: {} })).status).toBe(400);
    const mimo = dataOf(await t.call<VoiceDto>('POST', '/api/admin/voices', { token, body: { name: '未配置来源', provider: 'mimo', voiceName: '冰糖' } }));
    const unconfigured = await t.call('POST', `/api/admin/voices/${mimo.id}/preview`, { token, body: {} });
    expect(unconfigured).toMatchObject({ status: 502, body: { code: API_ERROR_CODES.upstream } });
  });

  it('imports the default catalog once and skips existing entries on repeat', async () => {
    // 上一个用例已经建了 Azure 晓晓 + cheerful，与目录中的同一条签名相同，应被跳过
    const first = dataOf(await t.call<VoiceImportResult>('POST', '/api/admin/voices/import-defaults', { token, body: {} }));
    expect(first).toEqual({ created: DEFAULT_VOICES.length - 1, skipped: 1 });
    const second = dataOf(await t.call<VoiceImportResult>('POST', '/api/admin/voices/import-defaults', { token, body: {} }));
    expect(second).toEqual({ created: 0, skipped: DEFAULT_VOICES.length });
    const listed = dataOf(await t.call<VoiceDto[]>('GET', '/api/admin/voices', { token }));
    const azure = listed.filter((item) => item.name.startsWith('Azure '));
    expect(azure.length).toBeGreaterThanOrEqual(60);
    expect(azure.every((item) => item.provider === 'azure' && item.language && item.gender && item.sampleText)).toBe(true);
    expect(listed.filter((item) => item.name.startsWith('Mimo ')).every((item) => item.provider === 'mimo' && item.style.length > 0)).toBe(true);
  });
});
