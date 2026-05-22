import { useSpeechPlayback } from '../../../hooks/useSpeechPlayback';
import { getPlayablePlaybackDelay } from '../../../utils/playableText';
import { getWerewolfNarration } from '../werewolfUtils';

const WEREWOLF_NIGHT_ACTION_HOLD_MS = 1000;
const WEREWOLF_NIGHT_ACTION_EVENT_TYPES = new Set(['wolf-vote', 'seer-check', 'guard-action', 'witch-action']);

function getWerewolfExtraFields(event, text) {
  return {
    fullText: event?.speech?.fullText || event?.testimony?.fullText || text,
    thinking: event?.speech?.thinking || event?.testimony?.thinking || ''
  };
}

function getWerewolfVoicePackageId(event, game, playerId) {
  if (!playerId) return event?.game?.host?.voicePackageId || null;
  const speechPlayer = (event?.game?.players || game?.players || []).find(
    (player) => Number(player.id) === Number(playerId)
  );
  return speechPlayer?.voicePackageId || null;
}

export function useWerewolfSpeechPlayback({
  game,
  speechEnabled,
  speak,
  acknowledgePending,
  setActiveSpeech
}) {
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
    playPendingWerewolfEvent: playPendingEvent
  };
}

function getWerewolfPlaybackDelay(event, narration, splitConfig) {
  const delay = getPlayablePlaybackDelay(narration, splitConfig);
  return WEREWOLF_NIGHT_ACTION_EVENT_TYPES.has(event?.type)
    ? Math.max(delay, WEREWOLF_NIGHT_ACTION_HOLD_MS)
    : delay;
}
