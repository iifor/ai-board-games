import { decryptSecret, encryptSecret } from '../../utils/crypto';
import type { Db } from '../../db/database';
import { readConfig, writeConfig } from './repository';
import { ConfigTransferError, configBundleSchema, type ConfigBundle } from './validator';

const PREFIX = 'AT-ODDS-CONFIG-1\n';

export function configCounts(data: ConfigBundle) {
  return { providers: data.providers.length, models: data.models.length, voices: data.voices.length,
    players: data.players.length, templates: data.templates.length,
    applied: data.applied.length, announcements: data.announcements.length };
}

export async function exportConfig(db: Db, key: Buffer) {
  const data = configBundleSchema.parse({
    format: 'at-odds-config', version: 1, exportedAt: new Date().toISOString(), ...await readConfig(db),
  });
  for (const provider of data.providers) {
    try { decryptSecret(provider.apiKeyEncrypted, key); }
    catch { throw new ConfigTransferError('SECRET_KEY 无法解密供应商配置，导出已取消。'); }
  }
  return { content: PREFIX + encryptSecret(JSON.stringify(data), key) + '\n', counts: configCounts(data) };
}

export function decodeConfig(content: string, sourceKey: Buffer): ConfigBundle {
  if (!content.startsWith(PREFIX)) throw new ConfigTransferError('配置文件格式或版本不受支持。');
  let plain: string;
  try { plain = decryptSecret(content.slice(PREFIX.length).trim(), sourceKey); }
  catch { throw new ConfigTransferError('无法解密配置文件，请核对源 SECRET_KEY 和文件完整性。'); }
  let raw: unknown;
  try { raw = JSON.parse(plain); }
  catch { throw new ConfigTransferError('配置文件内容无效。'); }
  return configBundleSchema.parse(raw);
}

export async function importConfig(db: Db, content: string, sourceKey: Buffer, targetKey: Buffer) {
  const data = decodeConfig(content, sourceKey);
  for (const provider of data.providers) {
    try { provider.apiKeyEncrypted = encryptSecret(decryptSecret(provider.apiKeyEncrypted, sourceKey), targetKey); }
    catch { throw new ConfigTransferError('无法解密文件中的供应商配置，导入已取消。'); }
  }
  await writeConfig(db, data);
  return configCounts(data);
}
