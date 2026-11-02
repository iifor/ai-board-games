import { createHash } from 'node:crypto';
import type { AudioRef, VoiceProvider } from '@battle/shared';
import { badRequest, upstream } from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { MediaRepository } from './repository';
import type { TtsProvider, TtsProviders, VoiceSpec } from './types';

export interface VoiceChoice extends VoiceSpec {
  readonly provider: VoiceProvider;
}

/** 音频按（来源、合成器签名、音色及其参数、文本）哈希寻址：换模型、改参数都不会复用旧缓存 */
export function assetId(provider: Pick<TtsProvider, 'signature'>, voice: VoiceChoice, text: string): string {
  const key = [voice.provider, provider.signature, voice.voiceName, voice.language, voice.style, voice.rate, voice.pitch, text].join('\u0000');
  return createHash('sha256').update(key).digest('hex').slice(0, 40);
}

export function createTtsService(providers: TtsProviders, repository: MediaRepository) {
  /** 合成并缓存；失败抛出可展示给管理员的错误（试听用） */
  async function synthesize(text: string, voice: VoiceChoice): Promise<AudioRef> {
    if (voice.provider === 'browser') throw badRequest('浏览器朗读的音色由前端直接试听');
    const provider = providers[voice.provider];
    if (!provider) throw upstream(`${voice.provider} 语音服务未配置，请检查服务端环境变量`);
    const id = assetId(provider, voice, text);
    const url = `/api/media/${id}`;
    if (await repository.exists(id)) return { url, mime: 'audio/mpeg' };
    let audio;
    try {
      audio = await provider.synthesize(text, voice);
    } catch (error) {
      throw upstream(error instanceof Error ? error.message : '语音合成失败');
    }
    await repository.insert({ id, provider: voice.provider, voiceName: voice.voiceName, mime: audio.mime, data: audio.data });
    return { url, mime: audio.mime };
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
