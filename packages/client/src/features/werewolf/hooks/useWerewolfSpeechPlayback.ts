import { useSpeechPlayback } from '../../../hooks/useSpeechPlayback';
import { getPlayablePlaybackDelay } from '../../../utils/playableText';
import { getWerewolfNarration } from '../utils';
import { resolveAudienceCue } from '../utils/audienceCue';
import type { GameEvent, GameState, Player, SpeechState, PlayableTextOptions, QueueItem } from '../../../types';

const WEREWOLF_NIGHT_ACTION_HOLD_MS = 1000;
const WEREWOLF_NIGHT_ACTION_EVENT_TYPES = new Set(['wolf-vote', 'seer-check', 'guard-action', 'witch-action']);

interface SpeechPlaybackControls {
  setAckTimer: (delay: number) => void;
  clearPendingAckTimer?: () => void;
}

function getWerewolfExtraFields(event: GameEvent, text: string): Partial<SpeechState> {
  return {
    fullText: event?.speech?.fullText || event?.testimony?.fullText || text,
    thinking: event?.speech?.thinking || event?.testimony?.thinking || ''
  };
}

function getWerewolfVoicePackageId(event: GameEvent, game: GameState | null, playerId: string): number | null {
  if (event?.debugMode || event?.game?.debugMode || game?.debugMode) return null;
  if (!playerId) {
    const hostRecord = (event?.game as Record<string, unknown> | undefined)?.host as Record<string, unknown> | undefined;
    return (hostRecord?.voicePackageId as number) || null;
  }
  const speechPlayer = ((event?.game?.players || game?.players || []) as Player[]).find(
    (player: Player) => Number(player.id) === Number(playerId)
  );
  return speechPlayer?.voicePackageId || null;
}

interface UseWerewolfSpeechPlaybackParams {
  game: GameState;
  speechEnabled: boolean;
  speak: (text: string, onEnd?: () => void, options?: Partial<QueueItem>) => boolean;
  acknowledgePending: () => void;
  setActiveSpeech: (state: SpeechState | ((prev: SpeechState | null) => SpeechState | null)) => void;
}

interface UseWerewolfSpeechPlaybackResult {
  clearSubtitleTimer: () => void;
  playPendingWerewolfEvent: (event: GameEvent, controls: SpeechPlaybackControls) => boolean;
}

export function useWerewolfSpeechPlayback({
  game,
  speechEnabled,
  speak,
  acknowledgePending,
  setActiveSpeech
}: UseWerewolfSpeechPlaybackParams): UseWerewolfSpeechPlaybackResult {
  const { clearSubtitleTimer, playPendingEvent } = useSpeechPlayback({
    game,
    speechEnabled,
    speak,
    acknowledgePending,
    setSpeechState: setActiveSpeech,
    extractNarration: getWerewolfNarration,
    getExtraFields: getWerewolfExtraFields,
    getVoicePackageId: getWerewolfVoicePackageId,
    getPlaybackDelay: getWerewolfPlaybackDelay
  });

  return {
    clearSubtitleTimer,
    playPendingWerewolfEvent: (event, controls) => {
      const cue = resolveAudienceCue(event);
      if (cue) {
        // audienceCue 通过弹窗展示文字，不经过字幕/subtitle 路径
        if (speechEnabled && cue.speech === 'browser') {
          try {
            const utterance = new SpeechSynthesisUtterance(cue.text);
            utterance.lang = 'zh-CN';
            utterance.rate = 0.9;
            utterance.onend = () => acknowledgePending();
            window.speechSynthesis.speak(utterance);
            return true;
          } catch {
            acknowledgePending();
            return true;
          }
        }
        controls.setAckTimer(getPlayablePlaybackDelay(cue.text));
        return true;
      }
      if (event.presentation?.suppressSpeech && !event.speech && !event.testimony) {
        controls.setAckTimer(120);
        return true;
      }
      return playPendingEvent(event, controls);
    }
  };
}

function getWerewolfPlaybackDelay(event: GameEvent, narration: string, splitConfig: PlayableTextOptions): number {
  const delay = getPlayablePlaybackDelay(narration, splitConfig);
  return WEREWOLF_NIGHT_ACTION_EVENT_TYPES.has(event?.type)
    ? Math.max(delay, WEREWOLF_NIGHT_ACTION_HOLD_MS)
    : delay;
}
