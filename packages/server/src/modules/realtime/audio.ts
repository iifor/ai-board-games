import type { AudioRef, StageEvent } from '@battle/shared';
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

function speakable(event: StageEvent): { text: string; seat: number | null } | null {
  switch (event.kind) {
    case 'speech':
      return { text: event.text, seat: event.seat };
    case 'judgement':
      return { text: event.comment, seat: event.seat };
    case 'narration':
    case 'revealed':
      return { text: event.text, seat: null };
    case 'action':
      return { text: event.text, seat: null };
    case 'game_over':
      return { text: event.result.summary, seat: null };
    default:
      return null;
  }
}

/** 为舞台事件准备语音：按座位音色合成，结果在进程内去重并由 TTS 服务持久缓存 */
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
      const content = scripted ? null : speakable(event);
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
