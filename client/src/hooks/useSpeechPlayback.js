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
      const hasSegmentAudio = Array.isArray(event.audioSegments) && event.audioSegments.length > 0;
      const queued = hasSegmentAudio || !event.audioUrl
        ? speakChunks(narration, playerId, event.ackId, event)
        : speakSingle(narration, playerId, event.ackId, event);

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
    const boundaries = collectWordBoundaries(event);
    if (boundaries.length) {
      playTimedSubtitles(boundaries, playerId, ackId, event);
      return;
    }
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

  function playTimedSubtitles(boundaries, playerId, ackId, event) {
    clearSubtitleTimer();
    if (!boundaries.length) return;
    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const extra = getExtraFields(event, '');
    // group words into phrases by pauses > 400ms
    const phrases = [];
    let current = { offset: boundaries[0].offset, words: [] };
    for (const b of boundaries) {
      const gap = current.words.length ? b.offset - (current.offset + boundaries[boundaries.indexOf(b) - 1].offset + boundaries[boundaries.indexOf(b) - 1].duration) : 0;
      if (gap > 400 && current.words.length) {
        phrases.push({ ...current, text: current.words.map((w) => w.text).join('') });
        current = { offset: b.offset, words: [] };
      }
      current.words.push(b);
    }
    if (current.words.length) {
      phrases.push({ ...current, text: current.words.map((w) => w.text).join('') });
    }

    let index = 0;
    const showNext = () => {
      setSpeechState({
        id: `${baseId}-${index}`,
        playerId,
        text: phrases[index].text,
        ...extra
      });
      index += 1;
      if (index < phrases.length) {
        const delay = phrases[index].offset - phrases[index - 1].offset;
        subtitleTimerRef.current = window.setTimeout(showNext, Math.max(200, delay));
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
          const seg = event?.audioSegments?.find((s) => Number(s.index) === index);
          setSpeechState({
            id: `${baseId}-${index}`,
            playerId,
            text: chunk,
            wordBoundaries: seg?.wordBoundaries || null,
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
          wordBoundaries: event?.wordBoundaries || event?.audioSegments?.[0]?.wordBoundaries || null,
          ...extra
        });
      }
    });
  }

  return { clearSubtitleTimer, playPendingEvent, playSubtitleText, speakChunks, speakSingle };
}

function collectWordBoundaries(event) {
  if (Array.isArray(event?.audioSegments) && event.audioSegments.length > 0) {
    let cumulativeOffset = 0;
    const all = [];
    for (const seg of event.audioSegments) {
      if (!Array.isArray(seg?.wordBoundaries)) continue;
      for (const b of seg.wordBoundaries) {
        all.push({ ...b, offset: (b.offset || 0) + cumulativeOffset });
      }
      const last = seg.wordBoundaries[seg.wordBoundaries.length - 1];
      if (last) cumulativeOffset += (last.offset || 0) + (last.duration || 0);
    }
    return all;
  }
  if (Array.isArray(event?.wordBoundaries)) return event.wordBoundaries;
  return [];
}

function getDefaultPlaybackDelay(event, narration, splitConfig) {
  return getPlayablePlaybackDelay(narration, splitConfig);
}
