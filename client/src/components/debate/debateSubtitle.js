export const DEBATE_SUBTITLE_CONFIG = {
  maxChars: 50
};

export function formatDebateSubtitle(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? trimSubtitleBreakMark(text) : '';
}

export function splitDebateSubtitle(value) {
  const source = String(value || '').replace(/\s+/g, ' ').trim();
  const sentenceChunks = source.match(/[^。！？?!；;]+[。！？?!；;]*/g)?.map(trimSubtitleBreakMark).filter(Boolean) || [];
  return sentenceChunks.length ? sentenceChunks : source ? [source] : [];
}

export function getSubtitleChunkDelay(text) {
  const length = String(text || '').length;
  return Math.max(1400, Math.min(3600, 900 + length * 70));
}

export function getSubtitlePlaybackDelay(text) {
  const chunks = splitDebateSubtitle(text);
  if (!chunks.length) return 300;
  const total = chunks.reduce((sum, chunk) => sum + getSubtitleChunkDelay(chunk), 0);
  return Math.max(900, Math.min(16000, total));
}

function trimSubtitleBreakMark(value) {
  return String(value || '').trim().replace(/[，,。.!！?？；;、：:]+$/u, '');
}
