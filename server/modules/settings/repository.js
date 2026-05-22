const { getDb } = require('../../db');

function getSettingValue(key) {
  const row = getDb().prepare('SELECT value_json AS valueJson FROM app_settings WHERE key = ?').get(key);
  return row ? row.valueJson : null;
}

function upsertSetting(key, valueJson) {
  getDb().prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(key, valueJson);
}

module.exports = { getSettingValue, upsertSetting };
