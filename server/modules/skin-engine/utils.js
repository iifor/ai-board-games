function slugify(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, '-').replace(/[^\w一-龥-]/g, '');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return '';
  const from = start + startMarker.length;
  const end = text.indexOf(endMarker, from);
  return text.slice(from, end === -1 ? text.length : end);
}

function chooseMemoryExample(role, examples = []) {
  if (!examples.length) return '';
  const keyword = role === 'keyFigure' ? '关键人物' : role === 'cover' ? '掩护者' : '调查方';
  return examples.find((item) => item.includes(keyword)) || examples[0];
}

module.exports = { slugify, clone, extractBetween, chooseMemoryExample };
