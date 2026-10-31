import { createHash } from 'node:crypto';
import type { AudioRef, VoiceProvider } from '@battle/shared';
import { logger } from '../../utils/logger';
import type { MediaRepository } from './repository';
import type { TtsProviders } from './types';

export interface VoiceChoice {
  readonly provider: VoiceProvider;
  readonly voiceName: string;
}

/** 语音合成 + 按（音色、文本）缓存；失败只记录日志并返回 null，前端会退回字幕或浏览器朗读 */
export function createTtsService(providers: TtsProviders, repository: MediaRepository) {
  return {
    async audioFor(text: string, voice: VoiceChoice | null): Promise<AudioRef | null> {
      if (!voice || voice.provider === 'browser' || !text.trim()) return null;
      const provider = providers[voice.provider];
      if (!provider) return null;
      const id = createHash('sha256').update(`${voice.provider}|${voice.voiceName}|${text}`).digest('hex').slice(0, 40);
      const url = `/api/media/${id}`;
      if (await repository.exists(id)) return { url, mime: 'audio/mpeg' };
      try {
        const audio = await provider.synthesize(text, voice.voiceName);
        await repository.insert({ id, provider: voice.provider, voiceName: voice.voiceName, mime: audio.mime, data: audio.data });
        return { url, mime: audio.mime };
      } catch (error) {
        logger.warn('语音合成失败', { provider: voice.provider, error: (error as Error).message });
        return null;
      }
    },
    find: (id: string) => repository.find(id),
  };
}

export type TtsService = ReturnType<typeof createTtsService>;
