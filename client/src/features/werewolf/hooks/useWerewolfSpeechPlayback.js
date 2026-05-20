import { useRef } from 'react';
import {
  PLAYABLE_TEXT_CONFIG,
  getPlayableChunkDelay,
  getPlayablePlaybackDelay,
  splitPlayableDisplaySegments
} from '../../../utils/playableText';
import { getWerewolfNarration } from '../werewolfUtils';

export function useWerewolfSpeechPlayback({
  game,
  speechEnabled,
  speak,
  acknowledgePending,
  setActiveSpeech
}) {
  const subtitleTimerRef = useRef(null);

  function clearSubtitleTimer() {
    if (!subtitleTimerRef.current) return;
    window.clearTimeout(subtitleTimerRef.current);
    subtitleTimerRef.current = null;
  }

  function playPendingWerewolfEvent(event, { setAckTimer }) {
    const narration = event.subtitle?.text || event.narration || getWerewolfNarration(event);
    const playerId = event?.speech?.playerId || event?.testimony?.playerId || null;
    if (speechEnabled && narration) {
      const hasSegmentAudio = Array.isArray(event.audioSegments) && event.audioSegments.length > 0;
      const queued = hasSegmentAudio || !event.audioUrl
        ? speakWerewolfChunks(narration, playerId, event.ackId, event)
        : speakWerewolfSingle(narration, playerId, event.ackId, event);
      if (!queued) {
        playWerewolfSubtitleText(narration, playerId, event.ackId, event);
        setAckTimer(getPlayablePlaybackDelay(narration, PLAYABLE_TEXT_CONFIG));
      }
    } else {
      playWerewolfSubtitleText(narration, playerId, event.ackId, event);
      setAckTimer(getPlayablePlaybackDelay(narration, PLAYABLE_TEXT_CONFIG));
    }
    return true;
  }

  function playWerewolfSubtitleText(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const chunks = splitPlayableDisplaySegments(text, PLAYABLE_TEXT_CONFIG);
    if (!chunks.length) return;
    let index = 0;
    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const showNext = () => {
      setActiveSpeech({
        id: `${baseId}-${index}`,
        playerId,
        text: chunks[index],
        fullText: event?.speech?.fullText || event?.testimony?.fullText || text,
        thinking: event?.speech?.thinking || event?.testimony?.thinking || ''
      });
      index += 1;
      if (index < chunks.length) {
        subtitleTimerRef.current = window.setTimeout(showNext, getPlayableChunkDelay(chunks[index - 1]));
      }
    };
    showNext();
  }

  function speakWerewolfChunks(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const chunks = splitPlayableDisplaySegments(text, PLAYABLE_TEXT_CONFIG);
    if (!chunks.length) return false;
    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const speechPlayer = getSpeechPlayer(event, game, playerId);
    let queued = true;
    chunks.forEach((chunk, index) => {
      const isLast = index === chunks.length - 1;
      const itemQueued = speak(chunk, isLast ? acknowledgePending : undefined, {
        playerId,
        voicePackageId: speechPlayer?.voicePackageId || (!playerId ? event?.game?.host?.voicePackageId : null),
        audioUrl: event?.audioSegments?.find((segment) => Number(segment.index) === index)?.audioUrl,
        onStart: () => {
          setActiveSpeech({
            id: `${baseId}-${index}`,
            playerId,
            text: chunk,
            fullText: event?.speech?.fullText || event?.testimony?.fullText || text,
            thinking: event?.speech?.thinking || event?.testimony?.thinking || ''
          });
        }
      });
      if (!itemQueued) queued = false;
    });
    return queued;
  }

  function speakWerewolfSingle(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const speechPlayer = getSpeechPlayer(event, game, playerId);
    return speak(text, acknowledgePending, {
      playerId,
      voicePackageId: speechPlayer?.voicePackageId || (!playerId ? event?.game?.host?.voicePackageId : null),
      audioUrl: event?.audioUrl,
      onStart: () => {
        setActiveSpeech({
          id: `${ackId || Date.now()}-${playerId || 'system'}`,
          playerId,
          text,
          fullText: event?.speech?.fullText || event?.testimony?.fullText || text,
          thinking: event?.speech?.thinking || event?.testimony?.thinking || ''
        });
      }
    });
  }

  return {
    clearSubtitleTimer,
    playPendingWerewolfEvent
  };
}

function getSpeechPlayer(event, game, playerId) {
  if (!playerId) return null;
  return (event?.game?.players || game?.players || []).find((player) => Number(player.id) === Number(playerId)) || null;
}
