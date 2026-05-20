export const PLAYABLE_TEXT_CONFIG = {
  maxChars: 50
};

export function stripSpeechParentheses(value) {
  let text = String(value || '');
  let previous = '';
  while (text && text !== previous) {
    previous = text;
    text = text.replace(/\([^()]*\)|（[^（）]*）/g, '');
  }
  return normalizePlayableWhitespace(text);
}

export function splitPlayableTextSegments(value, options = {}) {
  const maxChars = Number(options.maxChars) || PLAYABLE_TEXT_CONFIG.maxChars;
  const source = normalizePlayableWhitespace(value);
  if (!source) return [];
  const sentences = source.match(/[^。！？!?；;，,、：:\n]+[。！？!?；;，,、：:]*/g)
    ?.map(trimPlayableSegment)
    .filter(Boolean) || [];
  const chunks = (sentences.length ? sentences : [source]).flatMap((item) => splitLongSegment(item, maxChars));
  return chunks.map((displayText, index) => ({
    index,
    displayText,
    text: displayText,
    speechText: stripSpeechParentheses(displayText)
  })).filter((item) => item.displayText || item.speechText);
}

export function splitPlayableDisplaySegments(value, options = {}) {
  return splitPlayableTextSegments(value, options).map((item) => item.displayText);
}

export function getPlayableChunkDelay(text) {
  const length = String(text || '').length;
  return Math.max(1400, Math.min(3600, 900 + length * 70));
}

export function getPlayablePlaybackDelay(text, options = {}) {
  const chunks = splitPlayableDisplaySegments(text, options);
  if (!chunks.length) return 300;
  const total = chunks.reduce((sum, chunk) => sum + getPlayableChunkDelay(chunk), 0);
  return Math.max(900, Math.min(16000, total));
}

function splitLongSegment(value, maxChars) {
  const text = trimPlayableSegment(value);
  if (!text || text.length <= maxChars) return text ? [text] : [];
  const chunks = [];
  for (let index = 0; index < text.length; index += maxChars) {
    const chunk = trimPlayableSegment(text.slice(index, index + maxChars));
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

function normalizePlayableWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimPlayableSegment(value) {
  return normalizePlayableWhitespace(value).replace(/[。！？!?；;，,、：:]+$/u, '');
}
