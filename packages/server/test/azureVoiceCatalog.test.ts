import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAzureVoiceCatalog } from '../src/modules/voices/azureCatalog';

const config = { key: 'test-azure-private-key', region: 'eastus' };
const upstreamVoices = [
  { ShortName: 'zh-CN-XiaoxiaoNeural', StyleList: ['cheerful', 'chat', 'chat'], SecretField: 'not-public' },
  { ShortName: 'zh-CN-XiaochenNeural' },
];

afterEach(() => vi.restoreAllMocks());

describe('Azure voice style catalog', () => {
  it('uses the configured region and key, deduplicates styles and shares cached concurrent results', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(upstreamVoices));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const catalog = createAzureVoiceCatalog(config, request);
    const [first, second] = await Promise.all([catalog(), catalog()]);
    expect(first).toEqual([
      { voiceName: 'zh-CN-XiaoxiaoNeural', styles: ['cheerful', 'chat'] },
      { voiceName: 'zh-CN-XiaochenNeural', styles: [] },
    ]);
    expect(second).toEqual(first);
    expect(await catalog()).toEqual(first);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('https://eastus.tts.speech.microsoft.com/cognitiveservices/voices/list', expect.objectContaining({
      headers: { 'Ocp-Apim-Subscription-Key': config.key, Accept: 'application/json' }, redirect: 'error',
    }));
    clock.mockReturnValue(601001);
    await catalog();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('reports missing configuration without calling Azure', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(createAzureVoiceCatalog(null, request)()).rejects.toThrow('未配置');
    await expect(createAzureVoiceCatalog({ ...config, region: 'eastus/invalid' }, request)()).rejects.toThrow('区域配置无效');
    expect(request).not.toHaveBeenCalled();
  });

  it('does not cache errors or return upstream response details', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(config.key, { status: 401 }))
      .mockResolvedValueOnce(Response.json(upstreamVoices));
    const catalog = createAzureVoiceCatalog(config, request);
    await expect(catalog()).rejects.toThrow('请检查语音密钥及区域');
    expect(await catalog()).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('reports malformed JSON, invalid catalogs and network failures safely', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('not-json'))
      .mockResolvedValueOnce(Response.json([{ ShortName: 'x', StyleList: 'chat' }]))
      .mockRejectedValueOnce(new Error(config.key));
    const catalog = createAzureVoiceCatalog(config, request);
    await expect(catalog()).rejects.toThrow('无法读取 Azure 音色目录');
    await expect(catalog()).rejects.toThrow('目录格式无效');
    await expect(catalog()).rejects.toThrow('无法读取 Azure 音色目录');
  });
});
