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
      currentTimeMs: event?.currentTimeMs ?? null,
      ...extra
    });
    return baseId;
  }

  function speakSingle(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const isHostSpeech = !playerId;
    const voicePkgId = isHostSpeech ? null : getVoicePackageId(event, game, playerId);
    const audioUrl = isHostSpeech ? null : event?.audioUrl;
    const wordBoundaries = isHostSpeech ? null : event?.wordBoundaries || null;
    let speechId = null;
    return speak(text, acknowledgePending, {
      playerId,
      voicePackageId: voicePkgId,
      audioUrl,
      audioMimeType: isHostSpeech ? null : event?.audioMimeType,
      wordBoundaries,
      onStart: (media) => {
        speechId = playSubtitleText(text, playerId, ackId, {
          ...event,
          currentTimeMs: isHostSpeech ? null : 0,
          wordBoundaries: isHostSpeech ? null : media?.wordBoundaries || wordBoundaries
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

function getDefaultPlaybackDelay(event, narration, splitConfig) {
  return getPlayablePlaybackDelay(narration, splitConfig);
}
