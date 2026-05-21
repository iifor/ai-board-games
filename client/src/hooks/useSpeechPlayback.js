import { useRef } from 'react';
import {
  PLAYABLE_TEXT_CONFIG,
  getPlayableChunkDelay,
  getPlayablePlaybackDelay,
  splitPlayableDisplaySegments
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
      const hasSegmentAudio = Array.isArray(event.audioSegments) && event.audioSegments.length > 0;
      const queued = hasSegmentAudio || !event.audioUrl
        ? speakChunks(narration, playerId, event.ackId, event)
        : speakSingle(narration, playerId, event.ackId, event);

      if (!queued) {
        playSubtitleText(narration, playerId, event.ackId, event);
        setAckTimer(getPlayablePlaybackDelay(narration, splitConfig));
      }
    } else {
      playSubtitleText(narration, playerId, event.ackId, event);
      setAckTimer(getPlayablePlaybackDelay(narration, splitConfig));
    }
    return true;
  }

  function playSubtitleText(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const chunks = splitPlayableDisplaySegments(text, splitConfig);
    if (!chunks.length) return;
    let index = 0;
    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const extra = getExtraFields(event, text);

    const showNext = () => {
      setSpeechState({
        id: `${baseId}-${index}`,
        playerId,
        text: chunks[index],
        ...extra
      });
      index += 1;
      if (index < chunks.length) {
        subtitleTimerRef.current = window.setTimeout(showNext, getPlayableChunkDelay(chunks[index - 1]));
      }
    };
    showNext();
  }

  function speakChunks(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const chunks = splitPlayableDisplaySegments(text, splitConfig);
    if (!chunks.length) return false;

    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const voicePkgId = getVoicePackageId(event, game, playerId);
    const extra = getExtraFields(event, text);
    let queued = true;

    chunks.forEach((chunk, index) => {
      const isLast = index === chunks.length - 1;
      const itemQueued = speak(chunk, isLast ? acknowledgePending : undefined, {
        playerId,
        voicePackageId: voicePkgId,
        audioUrl: event?.audioSegments?.find((seg) => Number(seg.index) === index)?.audioUrl,
        onStart: () => {
          setSpeechState({
            id: `${baseId}-${index}`,
            playerId,
            text: chunk,
            ...extra
          });
        }
      });
      if (!itemQueued) queued = false;
    });
    return queued;
  }

  function speakSingle(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const voicePkgId = getVoicePackageId(event, game, playerId);
    const extra = getExtraFields(event, text);

    return speak(text, acknowledgePending, {
      playerId,
      voicePackageId: voicePkgId,
      audioUrl: event?.audioUrl,
      onStart: () => {
        setSpeechState({
          id: `${ackId || Date.now()}-${playerId || 'system'}`,
          playerId,
          text,
          ...extra
        });
      }
    });
  }

  return { clearSubtitleTimer, playPendingEvent, playSubtitleText, speakChunks, speakSingle };
}
