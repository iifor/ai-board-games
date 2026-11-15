import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { VoiceDto, VoicePreviewResult } from '@battle/shared';
import { createAzureTts } from '../src/modules/tts/azure';
import { prepareAzureSpeech } from '../src/modules/tts/azureSpeech';
import { buildAzureSsml } from '../src/modules/tts/azureSsml';
import type { AzureSynthesizer } from '../src/modules/tts/azureTransport';
import { assetId, createTtsService, type VoiceChoice } from '../src/modules/tts';
import type { MediaRepository, NewMediaAsset } from '../src/modules/tts/repository';
import { logger } from '../src/utils/logger';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

const voice: VoiceChoice = { provider: 'azure', voiceName: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN', style: 'cheerful', rate: '0%', pitch: '0%' };
const catalog = async () => [{ voiceName: voice.voiceName, styles: ['calm', 'angry', 'cheerful'] }];

function memoryMedia(): MediaRepository {
  const stored = new Map<string, NewMediaAsset>();
  return {
    find: async (id) => {
      const row = stored.get(id);
      return row ? { ...row, id, captions: row.captions ?? null, createdAt: new Date() } : undefined;
    },
    reference: async id => {
      const row = stored.get(id);
      return row ? { mime: row.mime, captions: row.captions ?? null } : undefined;
    },
    exists: async id => stored.has(id),
    locked: (id, work) => work({
      reference: async () => {
        const row = stored.get(id);
        return row ? { mime: row.mime, captions: row.captions ?? null } : undefined;
      },
      insert: async data => { stored.set(id, data); },
    }),
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Azure tagged speech', () => {
  it('compiles measured controls and suppresses unconfirmed HD pitch control', async () => {
    const controls = { pause: true, rate: true, pitch: true };
    const speech = await prepareAzureSpeech('甲[短停][放慢]乙[抬高音调]丙[恢复]丁', voice, catalog, controls);
    const ssml = buildAzureSsml(speech.voice, speech.text);
    expect(ssml).toContain('<break time="250ms"/>');
    expect(ssml).toContain('rate="-15%"');
    expect(ssml).toContain('pitch="10%"');
    expect(speech.voice.segments?.at(-1)).toMatchObject({ text: '丁', style: 'cheerful' });
    const hd = createAzureTts({ key: 'fixture-key', region: 'eastasia' }, catalog);
    const prepared = await hd.prepare!('[短停][放慢][抬高音调]你好', { ...voice, voiceName: 'zh-CN-Yunxi:DragonHDFlashLatestNeural' });
    const hdSsml = buildAzureSsml(prepared.voice, prepared.text);
    expect(hdSsml).toContain('rate="-15%"');
    expect(hdSsml).toContain('<break time="250ms"/>');
    expect(hdSsml).not.toContain('pitch=');
    expect(hdSsml).not.toMatch(/短停|放慢|抬高/);
  });

  it('selects the voice-specific style identifier when Chinese labels have aliases', async () => {
    const speech = await prepareAzureSpeech('[语音助手]你好', voice, async () => [{ voiceName: voice.voiceName, styles: ['voice-assistant'] }]);
    expect(speech.voice.segments?.[0]?.style).toBe('voice-assistant');
  });
  it('renders supported segment styles in one voice without reading tags and escapes dialogue', async () => {
    const speech = await prepareAzureSpeech('开场。[冷静]先校准一个概念。<A&B>【愤怒】请回答！[自然]结束。', voice, catalog, { pause: true, rate: true, pitch: true });
    const ssml = buildAzureSsml(speech.voice, speech.text);
    expect(speech.voice.segments?.map(segment => segment.style)).toEqual(['cheerful', 'calm', 'angry', '']);
    expect(ssml).not.toMatch(/冷静|愤怒|自然|<A&B>/);
    expect(ssml).toContain('&lt;A&amp;B&gt;');
    expect(ssml).toContain('<mstts:express-as style="calm"><prosody rate="0%" pitch="0%">先校准一个概念。');
    expect(ssml.match(/<voice /g)).toHaveLength(1);
  });

  it('removes unsupported emotion tags and falls back to the supported voice default or neutral', async () => {
    const text = '[严肃]请回答';
    const fallback = await prepareAzureSpeech(text, voice, catalog);
    expect(fallback.voice.segments).toEqual([{ text: '请回答', style: 'cheerful' }]);
    const neutral = await prepareAzureSpeech(text, voice, async () => []);
    expect(neutral.voice.segments).toEqual([{ text: '请回答', style: '' }]);
  });

  it('keeps speech available and tags silent when the catalog fails, and skips catalog reads for untagged text', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const load = vi.fn().mockRejectedValue(new Error('catalog offline'));
    expect(await prepareAzureSpeech('普通台词', voice, load)).toMatchObject({ text: '普通台词', voice });
    expect(load).not.toHaveBeenCalled();
    const speech = await prepareAzureSpeech('[冷静]继续说话', voice, load);
    expect(speech.voice.segments).toEqual([{ text: '继续说话', style: '' }]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('prepares before caching, deduplicates concurrent synthesis and changes the cache when resolved styles change', async () => {
    const request = vi.fn<AzureSynthesizer>().mockResolvedValue({ data: Buffer.from('audio-fixture'), mime: 'audio/mpeg', words: [] });
    const provider = createAzureTts({ key: 'fixture-key', region: 'eastus' }, catalog, request);
    const media = memoryMedia();
    const tts = createTtsService({ azure: provider }, media);
    const text = '[冷静]先校准一个概念【愤怒】请回答';
    const [first, duplicate] = await Promise.all([tts.synthesize(text, voice), tts.synthesize(text, voice)]);
    expect(duplicate.url).toBe(first.url);
    expect((await tts.synthesize(text, voice)).url).toBe(first.url);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toContain('style="calm"');
    expect(request.mock.calls[0]?.[0]).not.toMatch(/冷静|愤怒/);
    expect(first.url).not.toContain(assetId(provider, voice, text));
    const limitedProvider = createAzureTts({ key: 'fixture-key', region: 'eastus' }, async () => [], request);
    const changed = await createTtsService({ azure: limitedProvider }, media).synthesize(text, voice);
    expect(changed.url).not.toBe(first.url);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('rejects tags-only preview content before making a cloud synthesis request', async () => {
    const request = vi.fn<AzureSynthesizer>();
    const provider = createAzureTts({ key: 'fixture-key', region: 'eastus' }, catalog, request);
    await expect(createTtsService({ azure: provider }, memoryMedia()).synthesize('[冷静]【愤怒】', voice)).rejects.toThrow('朗读内容不能为空');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('Azure tagged preview HTTP entry point', () => {
  let app: TestApp;
  let token: string;
  const request = vi.fn<AzureSynthesizer>();
  beforeAll(async () => {
    const azure = createAzureTts({ key: 'fixture-key', region: 'eastus' }, catalog, request);
    app = await createTestApp({}, { ttsProviders: { azure }, azureVoiceCatalog: catalog });
    token = await app.adminToken();
  });
  afterAll(async () => app.cleanup());

  it('cleans preview tags through the real provider, caches its audio and rejects tags-only previews', async () => {
    request.mockResolvedValue({ data: Buffer.from('preview-audio-fixture'), mime: 'audio/mpeg', words: [
      { text: '先校准一个概念', startMs: 50, endMs: 1200 },
      { text: '请回答', startMs: 1800, endMs: 2600 },
    ] });
    const created = dataOf(await app.call<VoiceDto>('POST', '/api/admin/voices', { token, body: {
      name: '情绪标签试听', provider: 'azure', voiceName: voice.voiceName, style: '', sampleText: '[冷静]先校准一个概念。【愤怒】请回答。',
    } }));
    const path = `/api/admin/voices/${created.id}/preview`;
    const preview = () => app.call<VoicePreviewResult>('POST', path, { token, body: {} });
    const [first, second] = await Promise.all([preview(), preview()]);
    expect(dataOf(first)).toEqual(dataOf(second));
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toContain('style="calm"');
    expect(request.mock.calls[0]?.[0]).toContain('style="angry"');
    expect(request.mock.calls[0]?.[0]).not.toMatch(/冷静|愤怒/);
    const expectedCaptions = [
      { text: '先校准一个概念。', startMs: 50, endMs: 1200 },
      { text: '请回答。', startMs: 1800, endMs: 2600 },
    ];
    expect(dataOf(first)).toMatchObject({ captions: expectedCaptions });
    expect(dataOf(await preview())).toMatchObject({ captions: expectedCaptions });
    expect(await (await app.app.request(dataOf(first).url)).text()).toBe('preview-audio-fixture');
    expect((await app.call('POST', path, { token, body: { text: '[冷静]' } })).status).toBe(400);
    expect(request).toHaveBeenCalledOnce();
  });
});
