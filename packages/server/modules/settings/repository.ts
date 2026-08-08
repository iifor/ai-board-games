import { getDbExecutor } from '../../db';

async function getSettingValue(key: string): Promise<string | null> {
  const row = await getDbExecutor().queryOne<{ valueJson: string }>(
    'SELECT value_json AS "valueJson" FROM app_settings WHERE key = $1',
    [key],
  );
  return row?.valueJson ?? null;
}

async function upsertSetting(key: string, valueJson: string): Promise<void> {
  await getDbExecutor().execute(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `, [key, valueJson]);
}

export { getSettingValue, upsertSetting };
