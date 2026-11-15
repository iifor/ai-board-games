import type { AzureVoiceCatalogEntry } from '@battle/shared';
import { z } from 'zod';
import type { AppConfig } from '../../config/env';
import { AppError, upstream } from '../../utils/errors';

const CACHE_MS = 10 * 60_000;
const TIMEOUT_MS = 15_000;
const catalogSchema = z.array(z.object({
  ShortName: z.string().trim().min(1),
  StyleList: z.array(z.string().trim().min(1)).optional(),
}));

/** 按服务实例缓存区域目录，只缓存成功结果，并合并同时到达的查询。 */
export function createAzureVoiceCatalog(config: AppConfig['tts']['azure'], request: typeof fetch = fetch) {
  let cached: AzureVoiceCatalogEntry[] | undefined;
  let expiresAt = 0;
  let inflight: Promise<AzureVoiceCatalogEntry[]> | undefined;

  async function load(): Promise<AzureVoiceCatalogEntry[]> {
    if (!config) throw upstream('Azure 语音服务未配置，请配置语音密钥及区域后重试');
    if (!/^[a-z0-9-]+$/i.test(config.region)) throw upstream('Azure 语音区域配置无效');
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    try {
      const response = await request(`https://${config.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
        headers: { 'Ocp-Apim-Subscription-Key': config.key, Accept: 'application/json' },
        signal,
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) throw upstream('Azure 拒绝访问音色目录，请检查语音密钥及区域');
        throw upstream(`读取 Azure 音色目录失败（HTTP ${response.status}），请重试`);
      }
      const parsed = catalogSchema.safeParse(await response.json());
      if (!parsed.success) throw upstream('Azure 返回的音色目录格式无效，请重试');
      return parsed.data.map(voice => ({ voiceName: voice.ShortName, styles: [...new Set(voice.StyleList ?? [])] }));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw upstream(signal.aborted ? '读取 Azure 音色目录超时，请重试' : '无法读取 Azure 音色目录，请检查网络后重试');
    }
  }

  return function catalog(): Promise<AzureVoiceCatalogEntry[]> {
    if (cached && Date.now() < expiresAt) return Promise.resolve(cached);
    if (inflight) return inflight;
    inflight = load().then(rows => {
      cached = rows;
      expiresAt = Date.now() + CACHE_MS;
      return rows;
    }).finally(() => { inflight = undefined; });
    return inflight;
  };
}
