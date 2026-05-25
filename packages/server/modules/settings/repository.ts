import { getDb } from '../../db';

function getSettingValue(key: string): string | null {
  const row = getDb().prepare('SELECT value_json AS valueJson FROM app_settings WHERE key = ?').get(key) as { valueJson: string } | undefined;
  return row ? row.valueJson : null;
}

function upsertSetting(key: string, valueJson: string): void {
  getDb().prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(key, valueJson);
}

export { getSettingValue, upsertSetting };
