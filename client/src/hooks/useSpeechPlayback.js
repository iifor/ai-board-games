import { useRef } from 'react';
import {
  PLAYABLE_TEXT_CONFIG,
  getPlayablePlaybackDelay
} from '../utils/playableText';

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
}) {
  const subtitleTimerRef = useRef(null);

  function clearSubtitleTimer() {
    if (!subtitleTimerRef.current) return;
    window.clearTimeout(subtitleTimerRef.current);
    subtitleTimerRef.current = null;
  }

  function playPendingEvent(event, { setAckTimer }) {
    const narration = event.subtitle?.text || event.narration || extractNarration(event);
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

  function playSubtitleText(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const extra = getExtraFields(event, text);
    setSpeechState({
      id: baseId,
      playerId,
      text,
      wordBoundaries: event?.wordBoundaries || null,
      ...extra
    });
  }

  function speakSingle(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const voicePkgId = getVoicePackageId(event, game, playerId);
    return speak(text, acknowledgePending, {
      playerId,
      voicePackageId: voicePkgId,
      audioUrl: event?.audioUrl,
      audioMimeType: event?.audioMimeType,
      wordBoundaries: event?.wordBoundaries || null,
      onStart: (media) => {
        playSubtitleText(text, playerId, ackId, {
          ...event,
          wordBoundaries: media?.wordBoundaries || event?.wordBoundaries || null
        });
      }
    });
  }

  return { clearSubtitleTimer, playPendingEvent, playSubtitleText, speakSingle };
}

function getDefaultPlaybackDelay(event, narration, splitConfig) {
  return getPlayablePlaybackDelay(narration, splitConfig);
}
