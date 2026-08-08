import { getDbExecutor } from '../../db';
import type { VoicePackageRow } from '../../types/database';

interface InsertVoiceRow { name: string; provider: string; voice_id: string; language: string; gender: string; style: string; rate: string; pitch: string; temperature: number; sample_text: string; description: string; enabled: number }
interface UpdateVoiceRow extends InsertVoiceRow { id: number }

async function findVoiceById(id: string | number): Promise<VoicePackageRow | null> {
  return getDbExecutor().queryOne<VoicePackageRow>('SELECT * FROM voice_packages WHERE id = $1', [Number(id)]);
}
async function findAllVoices(): Promise<VoicePackageRow[]> {
  return getDbExecutor().queryMany<VoicePackageRow>('SELECT * FROM voice_packages ORDER BY updated_at DESC, id DESC');
}
async function findAzureVoiceIds(): Promise<string[]> {
  const rows = await getDbExecutor().queryMany<{ voice_id: string }>("SELECT voice_id FROM voice_packages WHERE lower(provider) = 'azure'");
  return rows.map((row) => String(row.voice_id || '').toLowerCase()).filter(Boolean);
}
async function findVoiceSignaturesByProvider(provider: string): Promise<string[]> {
  const rows = await getDbExecutor().queryMany<{ voice_id: string; style: string }>('SELECT voice_id, style FROM voice_packages WHERE lower(provider) = lower($1)', [provider]);
  return rows.map((row) => buildVoiceSignature(row.voice_id, row.style)).filter(Boolean);
}
function buildVoiceSignature(voiceId: string | null | undefined, style: string | null | undefined): string {
  return `${String(voiceId || '').trim().toLowerCase()}::${String(style || '').trim().toLowerCase()}`;
}
async function insertVoice(row: InsertVoiceRow): Promise<number> {
  const inserted = await getDbExecutor().queryOne<{ id: number }>(`
    INSERT INTO voice_packages (name, provider, voice_id, language, gender, style, rate, pitch, temperature, sample_text, description, enabled, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `, [row.name, row.provider, row.voice_id, row.language, row.gender, row.style, row.rate,
    row.pitch, row.temperature, row.sample_text, row.description, row.enabled]);
  if (!inserted) throw new Error('Failed to create voice package');
  return inserted.id;
}
async function updateVoice(row: UpdateVoiceRow): Promise<void> {
  await getDbExecutor().execute(`
    UPDATE voice_packages SET name = $1, provider = $2, voice_id = $3, language = $4,
      gender = $5, style = $6, rate = $7, pitch = $8, temperature = $9,
      sample_text = $10, description = $11, enabled = $12, updated_at = CURRENT_TIMESTAMP
    WHERE id = $13
  `, [row.name, row.provider, row.voice_id, row.language, row.gender, row.style, row.rate,
    row.pitch, row.temperature, row.sample_text, row.description, row.enabled, row.id]);
}
async function deleteVoiceById(id: string | number): Promise<void> {
  await getDbExecutor().execute('DELETE FROM voice_packages WHERE id = $1', [Number(id)]);
}

export { findVoiceById, findAllVoices, findAzureVoiceIds, findVoiceSignaturesByProvider, buildVoiceSignature, insertVoice, updateVoice, deleteVoiceById };
export type { InsertVoiceRow, UpdateVoiceRow };
