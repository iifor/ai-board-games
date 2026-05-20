import {
  PLAYABLE_TEXT_CONFIG,
  getPlayableChunkDelay,
  getPlayablePlaybackDelay,
  splitPlayableDisplaySegments
} from '../../utils/playableText';

export const DEBATE_SUBTITLE_CONFIG = PLAYABLE_TEXT_CONFIG;

export function formatDebateSubtitle(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.replace(/[。！？!?；;，,、：:]+$/u, '') : '';
}

export function splitDebateSubtitle(value, maxChars = DEBATE_SUBTITLE_CONFIG.maxChars) {
  return splitPlayableDisplaySegments(value, { maxChars });
}

export function getSubtitleChunkDelay(text) {
  return getPlayableChunkDelay(text);
}

export function getSubtitlePlaybackDelay(text) {
  return getPlayablePlaybackDelay(text, DEBATE_SUBTITLE_CONFIG);
}
