import { useSpeechPlayback } from '../../../hooks/useSpeechPlayback';
import { getWerewolfNarration } from '../werewolfUtils';

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
    getVoicePackageId: getWerewolfVoicePackageId
  });

  return {
    clearSubtitleTimer,
    playPendingWerewolfEvent: playPendingEvent
  };
}
