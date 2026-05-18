function splitPlayableTextSegments(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const sentences = text.match(/[^。！？?!；;]+[。！？?!；;]*/g)
    ?.map((item) => trimPlayableSegment(item))
    .filter(Boolean) || [];
  return sentences.length ? sentences : [text];
}

function trimPlayableSegment(value) {
  return String(value || '').trim().replace(/[，,。.!！?？；;、：:]+$/u, '');
}

module.exports = {
  splitPlayableTextSegments,
  trimPlayableSegment
};
