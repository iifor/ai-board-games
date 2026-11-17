import { createHash } from 'node:crypto';
import type { AudioCaptionCue, AudioRef, VoiceProvider } from '@battle/shared';
import { badRequest, upstream } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { createSemaphore } from '../../utils/semaphore';
import { MAX_CONCURRENT_SYNTHESES } from './constants';
import type { MediaRepository } from './repository';
import type { SynthesizedAudio, TtsProvider, TtsProviders, VoiceSpec } from './types';

export interface VoiceChoice extends VoiceSpec {
  readonly provider: VoiceProvider;
}

/** 音频按（来源、合成器签名、音色及其参数、文本）哈希寻址：换模型、改参数都不会复用旧缓存 */
export function assetId(provider: Pick<TtsProvider, 'signature'>, voice: VoiceChoice, text: string): string {
  const key = [voice.provider, provider.signature, voice.voiceName, voice.language, voice.style, voice.rate, voice.pitch, text,
    ...(voice.segments ? [JSON.stringify(voice.segments)] : []),
    ...(voice.controls ? [JSON.stringify(voice.controls)] : []),
  ].join('\u0000');
  return createHash('sha256').update(key).digest('hex').slice(0, 40);
}

export interface TtsServiceOptions {
  /** 同时持锁合成的上限，见 MAX_CONCURRENT_SYNTHESES */
  readonly maxConcurrent?: number;
}

export function createTtsService(providers: TtsProviders, repository: MediaRepository, options: TtsServiceOptions = {}) {
  /** 本进程内同一音频只合成一次（快路径）；跨实例靠仓储的 advisory lock */
  const inflight = new Map<string, Promise<AudioRef>>();
  /** 先拿名额再开持锁事务：同时占用的连接数不超过上限，排队期间不占连接 */
  const slots = createSemaphore(options.maxConcurrent ?? MAX_CONCURRENT_SYNTHESES);

  const reference = (id: string, asset: { readonly mime: string; readonly captions?: readonly AudioCaptionCue[] | null }): AudioRef => ({
    url: `/api/media/${id}`, mime: asset.mime, ...(asset.captions?.length ? { captions: asset.captions } : {}),
  });

  async function callProvider(provider: TtsProvider, text: string, voice: VoiceChoice): Promise<SynthesizedAudio> {
    try {
      return await provider.synthesize(text, voice);
    } catch (error) {
      throw upstream(error instanceof Error ? error.message : '语音合成失败');
    }
  }

  /** 合成并缓存；失败抛出可展示给管理员的错误（试听用） */
  async function synthesize(text: string, voice: VoiceChoice): Promise<AudioRef> {
    if (voice.provider === 'browser') throw badRequest('浏览器朗读的音色由前端直接试听');
    const provider = providers[voice.provider];
    if (!provider) throw upstream(`${voice.provider} 语音服务未配置，请检查服务端环境变量`);
    if (provider.prepare) {
      const speech = await provider.prepare(text, voice);
      text = speech.text;
      voice = { ...speech.voice, provider: voice.provider };
    }
    if (!text.trim()) throw badRequest('朗读内容不能为空');
    const id = assetId(provider, voice, text);
    const cached = await repository.reference(id);
    if (cached) return reference(id, cached);
    const existing = inflight.get(id);
    if (existing) return existing;
    const job = slots.run(() => repository.locked(id, async (asset): Promise<AudioRef> => {
      // 排队或等锁期间另一实例可能已经合成并提交
      const cached = await asset.reference();
      if (cached) return reference(id, cached);
      const audio = await callProvider(provider, text, voice);
      await asset.insert({ provider: voice.provider, voiceName: voice.voiceName, ...audio });
      return reference(id, audio);
    })).finally(() => inflight.delete(id));
    inflight.set(id, job);
    return job;
  }

  return {
    synthesize,
    /** 对局播放用：失败只记录日志并返回 null，前端会退回字幕或浏览器朗读 */
    async audioFor(text: string, voice: VoiceChoice | null): Promise<AudioRef | null> {
      if (!voice || voice.provider === 'browser' || !text.trim() || !providers[voice.provider]) return null;
      try {
        return await synthesize(text, voice);
      } catch (error) {
        logger.warn('语音合成失败', { provider: voice.provider, error: (error as Error).message });
        return null;
      }
    },
    find: (id: string) => repository.find(id),
  };
}

export type TtsService = ReturnType<typeof createTtsService>;
