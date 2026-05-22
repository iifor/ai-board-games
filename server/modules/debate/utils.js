function normalizeText(text, limit = 300) {
  return String(text || '').trim().slice(0, limit);
}

module.exports = { normalizeText };
