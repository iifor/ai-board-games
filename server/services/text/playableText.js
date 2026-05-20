const PLAYABLE_TEXT_CONFIG = {
  maxChars: 50
};

function stripSpeechParentheses(value) {
  let text = String(value || '');
  let previous = '';
  while (text && text !== previous) {
    previous = text;
    text = text.replace(/\([^()]*\)|（[^（）]*）/g, '');
  }
  return normalizePlayableWhitespace(text);
}

function splitPlayableTextSegments(value, options = {}) {
  const maxChars = Number(options.maxChars) || PLAYABLE_TEXT_CONFIG.maxChars;
  const source = normalizePlayableWhitespace(value);
  if (!source) return [];
  const sentences = source.match(/[^。！？!?；;，,、：:\n]+[。！？!?；;，,、：:]*/g)
    ?.map(trimPlayableSegment)
    .filter(Boolean) || [];
  return (sentences.length ? sentences : [source])
    .flatMap((item) => splitLongSegment(item, maxChars))
    .map((displayText, index) => ({
      index,
      displayText,
      text: displayText,
      speechText: stripSpeechParentheses(displayText)
    }))
    .filter((item) => item.displayText || item.speechText);
}

function splitPlayableDisplaySegments(value, options = {}) {
  return splitPlayableTextSegments(value, options).map((item) => item.displayText);
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

module.exports = {
  PLAYABLE_TEXT_CONFIG,
  splitPlayableDisplaySegments,
  splitPlayableTextSegments,
  stripSpeechParentheses
};
