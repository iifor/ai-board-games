function toJson(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function skinToRow(template) {
  return {
    id: template.id || slugifyId(template.name),
    name: template.name,
    version: template.version || 'v3.2',
    source: template.source || 'admin',
    terms_json: toJson(template.terms || {}),
    background: template.background || '',
    truth: template.truth || '',
    clues_json: toJson(template.clues || []),
    noises_json: toJson(template.noises || []),
    memory_examples_json: toJson(template.memoryExamples || template.memory_examples || []),
    enabled: Number(template.enabled !== false)
  };
}

function rowToSkin(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, version: row.version, source: row.source,
    terms: parseJson(row.terms_json, {}), background: row.background, truth: row.truth,
    clues: parseJson(row.clues_json, []), noises: parseJson(row.noises_json, []),
    memoryExamples: parseJson(row.memory_examples_json, []),
    enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function slugifyId(text) {
  const slug = String(text || 'skin').toLowerCase().replace(/\s+/g, '-').replace(/[^\w一-龥-]/g, '');
  return `skin-${slug || Date.now()}`;
}

function normalizeImportedSkin(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('皮肤导入失败：需要一个 JSON 对象。');
  if (!raw.name || !raw.background || !raw.truth || !Array.isArray(raw.clues)) {
    throw new Error('皮肤导入失败：需要 name、background、truth、clues 字段。');
  }
  return {
    id: raw.id || slugifyId(raw.name), name: raw.name, version: raw.version || 'v3.2',
    source: raw.source || 'json', terms: raw.terms || {}, background: raw.background,
    truth: raw.truth, clues: raw.clues, noises: raw.noises || [],
    memoryExamples: raw.memoryExamples || raw.memory_examples || [], enabled: raw.enabled !== false
  };
}

function getSkinImportTemplate() {
  return {
    id: 'skin-demo', name: '皮肤名称', version: 'v3.2', source: 'json', terms: {},
    background: '事件背景', truth: '真相', clues: [{ title: '线索标题', text: '线索内容' }],
    noises: [], memoryExamples: [], enabled: true
  };
}

module.exports = { toJson, parseJson, skinToRow, rowToSkin, slugifyId, normalizeImportedSkin, getSkinImportTemplate };
