import { useRef } from 'react';
import type { SpeechState, GameEvent, GameState, QueueItem } from '../types';
import {
  PLAYABLE_TEXT_CONFIG,
  getPlayablePlaybackDelay
} from '../utils/playableText';
import type { PlayableTextOptions } from '../types';

interface UseSpeechPlaybackParams {
  game: GameState | null;
  speechEnabled: boolean;
  speak: (text: string, onEnd?: () => void, options?: Partial<QueueItem>) => boolean;
  acknowledgePending: () => void;
  setSpeechState: (state: SpeechState | ((current: SpeechState | null) => SpeechState | null)) => void;
  extractNarration: (event: GameEvent) => string | null;
  getExtraFields: (event: GameEvent, text: string) => Partial<SpeechState>;
  getVoicePackageId: (event: GameEvent, game: GameState | null, playerId: string) => number | null | undefined;
  getPlaybackDelay?: (event: GameEvent, narration: string, splitConfig: PlayableTextOptions) => number;
  splitConfig?: PlayableTextOptions;
}

export function useSpeechPlayback({
  game,
  speechEnabled,
  speak,
  acknowledgePending,
  setSpeechState,
  extractNarration,
  getExtraFields,
  getVoicePackageId,
  getPlaybackDelay = getDefaultPlaybackDelay,
  splitConfig = PLAYABLE_TEXT_CONFIG
}: UseSpeechPlaybackParams) {
  const subtitleTimerRef = useRef<number | null>(null);

  function clearSubtitleTimer() {
    if (!subtitleTimerRef.current) return;
    window.clearTimeout(subtitleTimerRef.current);
    subtitleTimerRef.current = null;
  }

  function playPendingEvent(event: GameEvent, { setAckTimer }: { setAckTimer: (delay: number) => void }): boolean {
    const narration = event.subtitle?.text || event.narration || extractNarration(event) || '';
    const playerId = event?.speech?.playerId || event?.testimony?.playerId || null;

    if (speechEnabled && narration) {
      const queued = speakSingle(narration, playerId, event.ackId, event);

      if (!queued) {
        playSubtitleText(narration, playerId, event.ackId, event);
        setAckTimer(getPlaybackDelay(event, narration, splitConfig));
      }
    } else {
      playSubtitleText(narration, playerId, event.ackId, event);
      setAckTimer(getPlaybackDelay(event, narration, splitConfig));
    }
    return true;
  }

  function playSubtitleText(text: string, playerId: string | null | undefined, ackId: string | undefined, event: GameEvent): string {
    clearSubtitleTimer();
    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const extra = getExtraFields(event, text);
    setSpeechState({
      id: baseId,
      playerId: playerId || null,
      text,
      wordBoundaries: event?.wordBoundaries || null,
      currentTimeMs: event?.currentTimeMs ?? null,
      ...extra
    });
    return baseId;
  }

  function speakSingle(text: string, playerId: string | null | undefined, ackId: string | undefined, event: GameEvent): boolean {
    clearSubtitleTimer();
    const isHostSpeech = !playerId;
    const browserSpeechOnly = shouldUseBrowserSpeechOnly(event, game);
    const voicePkgId = isHostSpeech || browserSpeechOnly ? null : getVoicePackageId(event, game, playerId!);
    const audioUrl = isHostSpeech || browserSpeechOnly ? null : event?.audioUrl;
    const wordBoundaries = isHostSpeech ? null : event?.wordBoundaries || null;
    let speechId: string | null = null;
    return speak(text, acknowledgePending, {
      playerId: playerId || undefined,
      voicePackageId: voicePkgId,
      audioUrl: audioUrl || undefined,
      audioMimeType: isHostSpeech ? undefined : event?.audioMimeType,
      wordBoundaries: wordBoundaries || undefined,
      onStart: (media) => {
        speechId = playSubtitleText(text, playerId, ackId, {
          ...event,
          currentTimeMs: isHostSpeech ? undefined : 0,
          wordBoundaries: isHostSpeech ? undefined : media?.wordBoundaries || wordBoundaries || undefined
        });
      },
      onTimeChange: (currentTimeMs) => {
        if (!speechId) return;
        setSpeechState((current) => {
          if (!current || current.id !== speechId) return current;
          return { ...current, currentTimeMs };
        });
      }
    });
  }

  return { clearSubtitleTimer, playPendingEvent, playSubtitleText, speakSingle };
}

function getDefaultPlaybackDelay(_event: GameEvent, narration: string, splitConfig: PlayableTextOptions): number {
  return getPlayablePlaybackDelay(narration, splitConfig);
}

function shouldUseBrowserSpeechOnly(event: GameEvent, game: GameState | null): boolean {
  return Boolean(event?.debugMode || event?.game?.debugMode || game?.debugMode);
}
