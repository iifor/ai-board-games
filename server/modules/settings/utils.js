function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
function toJson(value) { return JSON.stringify(value ?? null); }

module.exports = { parseJson, toJson };
