import { speechOf, type AudioRef, type StageEvent } from '@battle/shared';
import type { MatchRepository } from '../matches/repository';
import type { TtsService, VoiceChoice } from '../tts';
import type { VoiceRepository } from '../voices/repository';

/** 主持播报使用名为"主持人"的音色；没有则交给前端朗读 */
export const HOST_VOICE_NAME = '主持人';

export interface AudioResolverDeps {
  readonly voices: Pick<VoiceRepository, 'findEnabledByName'>;
  readonly matches: Pick<MatchRepository, 'seatVoice'>;
  readonly tts: Pick<TtsService, 'audioFor'>;
}

/**
 * 为舞台事件准备语音：按座位音色合成，结果在进程内去重并由 TTS 服务持久缓存。
 * 哪些事件朗读、读什么由 @battle/shared 的 speechOf 决定，与客户端的浏览器朗读共用同一口径。
 */
export function createAudioResolver(deps: AudioResolverDeps) {
  const inflight = new Map<string, Promise<AudioRef | null>>();

  async function voiceFor(matchId: string, seat: number | null): Promise<VoiceChoice | null> {
    const row = seat === null
      ? await deps.voices.findEnabledByName(HOST_VOICE_NAME)
      : await deps.matches.seatVoice(matchId, seat);
    return row ? { ...row, provider: row.provider as VoiceChoice['provider'] } : null;
  }

  return {
    audioFor(matchId: string, event: StageEvent, scripted: boolean): Promise<AudioRef | null> {
      const content = scripted ? null : speechOf(event);
      if (!content) return Promise.resolve(null);
      const key = `${matchId}:${event.seq}`;
      const existing = inflight.get(key);
      if (existing) return existing;
      const job = voiceFor(matchId, content.seat).then((voice) => deps.tts.audioFor(content.text, voice));
      inflight.set(key, job);
      void job.finally(() => setTimeout(() => inflight.delete(key), 60_000));
      return job;
    },
  };
}

export type AudioResolver = ReturnType<typeof createAudioResolver>;
