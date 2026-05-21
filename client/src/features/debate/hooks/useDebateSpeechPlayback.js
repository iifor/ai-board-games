import { useSpeechPlayback } from '../../../hooks/useSpeechPlayback';
import { PLAYABLE_TEXT_CONFIG, getPlayablePlaybackDelay } from '../../../utils/playableText';
import { getDebateNarration } from '../debateUtils';

function getDebateExtraFields(event, text) {
  return {
    speakerLabel: event?.subtitle?.speakerLabel || '',
    speakerRole: event?.subtitle?.speakerRole || '',
    fullText: event?.speech?.fullText || text,
    thinking: event?.speech?.thinking || ''
  };
}

function getDebateVoicePackageId(event, game, playerId) {
  return (event?.game?.players || game?.players || []).find(
    (player) => Number(player.id) === Number(playerId)
  )?.voicePackageId;
}

export function useDebateSpeechPlayback({
  game,
  speechEnabled,
  speak,
  acknowledgePending,
  setActiveSpeech,
  setSubtitleSpeech
}) {
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

  function playPendingDebateEvent(event, { setAckTimer }) {
    const narration = event.subtitle?.text || event.narration || getDebateNarration(event);

    if (speechEnabled && narration) {
      const shouldUseChunks = Boolean(event?.speech?.playerId);
      const queued = shouldUseChunks
        ? shared.speakChunks(narration, event?.speech?.playerId || null, event.ackId, event)
        : event.audioUrl
          ? shared.speakSingle(narration, event?.speech?.playerId || null, event.ackId, event)
          : shared.speakChunks(narration, event?.speech?.playerId || null, event.ackId, event);

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
