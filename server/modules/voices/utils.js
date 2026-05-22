function rowToVoicePackage(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, provider: row.provider,
    voiceId: row.voice_id, language: row.language,
    gender: row.gender || '', style: row.style || '',
    rate: row.rate || '0%', pitch: row.pitch || '0%',
    temperature: Number(row.temperature ?? 0.85),
    sampleText: row.sample_text || '', description: row.description,
    enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function voicePackageToRow(input) {
  return {
    name: String(input.name || '').trim(),
    provider: String(input.provider || 'browser').trim(),
    voice_id: String(input.voiceId || input.voice_id || '').trim(),
    language: String(input.language || 'zh-CN').trim(),
    gender: String(input.gender || '').trim(),
    style: String(input.style || '').trim(),
    rate: String(input.rate || '0%').trim(),
    pitch: String(input.pitch || '0%').trim(),
    temperature: Number(input.temperature ?? 0.85),
    sample_text: String(input.sampleText || input.sample_text || '').trim(),
    description: String(input.description || '').trim(),
    enabled: Number(input.enabled !== false)
  };
}

module.exports = { rowToVoicePackage, voicePackageToRow };
