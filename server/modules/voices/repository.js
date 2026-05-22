const { getDb } = require('../../db');

function findVoiceById(id) {
  return getDb().prepare('SELECT * FROM voice_packages WHERE id = ?').get(Number(id)) || null;
}

function findAllVoices() {
  return getDb().prepare('SELECT * FROM voice_packages ORDER BY updated_at DESC, id DESC').all();
}

function findAzureVoiceIds() {
  return getDb().prepare("SELECT voice_id FROM voice_packages WHERE lower(provider) = 'azure'").all()
    .map(r => String(r.voice_id || '').toLowerCase()).filter(Boolean);
}

function insertVoice(row) {
  const result = getDb().prepare(`
    INSERT INTO voice_packages (name, provider, voice_id, language, gender, style, rate, pitch, temperature, sample_text, description, enabled, created_at, updated_at)
    VALUES (@name, @provider, @voice_id, @language, @gender, @style, @rate, @pitch, @temperature, @sample_text, @description, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(row);
  return result.lastInsertRowid;
}

function updateVoice(row) {
  getDb().prepare(`
    UPDATE voice_packages
    SET name = @name, provider = @provider, voice_id = @voice_id, language = @language,
        gender = @gender, style = @style, rate = @rate, pitch = @pitch, temperature = @temperature,
        sample_text = @sample_text, description = @description, enabled = @enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(row);
}

function deleteVoiceById(id) {
  getDb().prepare('DELETE FROM voice_packages WHERE id = ?').run(Number(id));
}

module.exports = { findVoiceById, findAllVoices, findAzureVoiceIds, insertVoice, updateVoice, deleteVoiceById };
