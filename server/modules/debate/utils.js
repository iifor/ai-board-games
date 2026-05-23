// limit 仅作为提示词弱约束，不做实际截断处理
function normalizeText(text, limit = 300) {
  return String(text || '').trim();
}

module.exports = { normalizeText };
