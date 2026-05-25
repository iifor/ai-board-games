import { useSpeechPlayback } from '../../../hooks/useSpeechPlayback';
import { PLAYABLE_TEXT_CONFIG, getPlayablePlaybackDelay } from '../../../utils/playableText';
import { getDebateNarration } from '../debateUtils';
import type { GameEvent, SpeechState, GameState } from '../../../types';

interface UseDebateSpeechPlaybackParams {
  game: GameState;
  speechEnabled: boolean;
  speak: (text: string, onEnd?: () => void, options?: Record<string, unknown>) => boolean;
  acknowledgePending: () => void;
  setActiveSpeech: (state: { playerId: string | null; text: string } | null) => void;
  setSubtitleSpeech: (state: SpeechState | ((current: SpeechState | null) => SpeechState | null)) => void;
}

interface UseDebateSpeechPlaybackReturn {
  clearSubtitleTimer: () => void;
  playPendingDebateEvent: (event: GameEvent, controls: { setAckTimer: (delay: number) => void }) => boolean;
  playSubtitleText: (text: string, playerId: string | null | undefined, ackId: string | undefined, event: GameEvent) => string;
}

function getDebateExtraFields(event: GameEvent, text: string): Partial<SpeechState> {
  return {
    speakerLabel: (event?.subtitle as Record<string, unknown>)?.speakerLabel as string || '',
    speakerRole: (event?.subtitle as Record<string, unknown>)?.speakerRole as string || '',
    fullText: (event?.speech as Record<string, unknown>)?.fullText as string || text,
    thinking: (event?.speech as Record<string, unknown>)?.thinking as string || ''
  };
}

function getDebateVoicePackageId(event: GameEvent, game: GameState | null, playerId: string): number | null | undefined {
  return ((event?.game as GameState)?.players || game?.players || []).find(
    (player) => Number(player.id) === Number(playerId)
  )?.voicePackageId;
}

export function useDebateSpeechPlayback({
  game,
  speechEnabled,
  speak,
  acknowledgePending,
  setActiveSpeech: _setActiveSpeech,
  setSubtitleSpeech
}: UseDebateSpeechPlaybackParams): UseDebateSpeechPlaybackReturn {
  const shared = useSpeechPlayback({
    game,
    speechEnabled,
    speak,
    acknowledgePending,
    setSpeechState: setSubtitleSpeech,
    extractNarration: getDebateNarration,
    getExtraFields: getDebateExtraFields,
    getVoicePackageId: getDebateVoicePackageId,
    splitConfig: PLAYABLE_TEXT_CONFIG
  });

  function playPendingDebateEvent(event: GameEvent, { setAckTimer }: { setAckTimer: (delay: number) => void }): boolean {
    const narration = event.subtitle?.text || event.narration || getDebateNarration(event);

    if (speechEnabled && narration) {
      const queued = shared.speakSingle(narration, event?.speech?.playerId || null, event.ackId, event);

      if (!queued) {
        shared.playSubtitleText(narration, event?.speech?.playerId || null, event.ackId, event);
        setAckTimer(getPlayablePlaybackDelay(narration));
      }
    } else {
      shared.playSubtitleText(narration, event?.speech?.playerId || null, event.ackId, event);
      setAckTimer(getPlayablePlaybackDelay(narration));
    }
    return true;
  }

  return {
    clearSubtitleTimer: shared.clearSubtitleTimer,
    playPendingDebateEvent,
    playSubtitleText: shared.playSubtitleText
  };
}
