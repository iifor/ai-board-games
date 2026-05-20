import { useRef } from 'react';
import {
  DEBATE_SUBTITLE_CONFIG,
  getSubtitleChunkDelay,
  getSubtitlePlaybackDelay,
  splitDebateSubtitle
} from '../debateSubtitle';
import { getDebateNarration } from '../debateUtils';

export function useDebateSpeechPlayback({
  game,
  speechEnabled,
  speak,
  acknowledgePending,
  setActiveSpeech,
  setSubtitleSpeech
}) {
  const subtitleTimerRef = useRef(null);

  function clearSubtitleTimer() {
    if (!subtitleTimerRef.current) return;
    window.clearTimeout(subtitleTimerRef.current);
    subtitleTimerRef.current = null;
  }

  function playPendingDebateEvent(event, { setAckTimer }) {
    const narration = event.subtitle?.text || event.narration || getDebateNarration(event);
    if (speechEnabled && narration) {
      const shouldUseSentenceQueue = Boolean(event?.speech?.playerId);
      const queued = shouldUseSentenceQueue
        ? speakSubtitleChunks(narration, event?.speech?.playerId || null, event.ackId, event)
        : event.audioUrl
        ? speakServerSubtitle(narration, event?.speech?.playerId || null, event.ackId, event)
        : speakSubtitleChunks(narration, event?.speech?.playerId || null, event.ackId, event);
      if (!queued) {
        playSubtitleText(narration, event?.speech?.playerId || null, event.ackId, event);
        setAckTimer(getSubtitlePlaybackDelay(narration));
      }
    } else {
      playSubtitleText(narration, event?.speech?.playerId || null, event.ackId, event);
      setAckTimer(getSubtitlePlaybackDelay(narration));
    }
    return true;
  }

  function playSubtitleText(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const chunks = splitDebateSubtitle(text, DEBATE_SUBTITLE_CONFIG.maxChars);
    if (!chunks.length) {
      setSubtitleSpeech(null);
      return;
    }
    let index = 0;
    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const showNext = () => {
      setSubtitleSpeech({
        id: `${baseId}-${index}`,
        playerId,
        text: chunks[index],
        speakerLabel: event?.subtitle?.speakerLabel || '',
        speakerRole: event?.subtitle?.speakerRole || ''
      });
      index += 1;
      if (index < chunks.length) {
        subtitleTimerRef.current = window.setTimeout(showNext, getSubtitleChunkDelay(chunks[index - 1]));
      }
    };
    showNext();
  }

  function speakSubtitleChunks(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const chunks = splitDebateSubtitle(text, DEBATE_SUBTITLE_CONFIG.maxChars);
    if (!chunks.length) return false;
    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const voicePackageId = (event?.game?.players || game?.players || []).find((player) => Number(player.id) === Number(playerId))?.voicePackageId;
    let queued = true;
    chunks.forEach((chunk, index) => {
      const isLast = index === chunks.length - 1;
      const itemQueued = speak(chunk, isLast ? acknowledgePending : undefined, {
        playerId,
        voicePackageId,
        audioUrl: event?.audioSegments?.find((segment) => Number(segment.index) === index)?.audioUrl,
        onStart: () => {
          setSubtitleSpeech({
            id: `${baseId}-${index}`,
            playerId,
            text: chunk,
            speakerLabel: event?.subtitle?.speakerLabel || '',
            speakerRole: event?.subtitle?.speakerRole || '',
            fullText: event?.speech?.fullText || text,
            thinking: event?.speech?.thinking || ''
          });
        }
      });
      if (!itemQueued) queued = false;
    });
    return queued;
  }

  function speakServerSubtitle(text, playerId, ackId, event) {
    clearSubtitleTimer();
    return speak(text, acknowledgePending, {
      ...getDebateSpeechOptions(event, playerId),
      onStart: () => {
        setSubtitleSpeech({
          id: `${ackId || Date.now()}-${playerId || 'system'}`,
          playerId,
          text,
          speakerLabel: event?.subtitle?.speakerLabel || '',
          speakerRole: event?.subtitle?.speakerRole || '',
          fullText: event?.speech?.fullText || text,
          thinking: event?.speech?.thinking || ''
        });
      }
    });
  }

  function getDebateSpeechOptions(event, playerId) {
    const player = (event?.game?.players || game?.players || []).find((item) => Number(item.id) === Number(playerId));
    const hostVoicePackageId = event?.game?.host?.voicePackageId || game?.host?.voicePackageId || null;
    return {
      playerId,
      voicePackageId: player?.voicePackageId || (!playerId ? hostVoicePackageId : null),
      audioUrl: event?.audioUrl
    };
  }

  return {
    clearSubtitleTimer,
    playPendingDebateEvent,
    playSubtitleText
  };
}
