import { getDb } from '../../db';
import type { VoicePackageRow } from '../../types/database';

interface InsertVoiceRow {
  name: string;
  provider: string;
  voice_id: string;
  language: string;
  gender: string;
  style: string;
  rate: string;
  pitch: string;
  temperature: number;
  sample_text: string;
  description: string;
  enabled: number;
}

interface UpdateVoiceRow extends InsertVoiceRow {
  id: number;
}

function findVoiceById(id: string | number): VoicePackageRow | null {
  return (getDb().prepare('SELECT * FROM voice_packages WHERE id = ?').get(Number(id)) as VoicePackageRow | undefined) || null;
}

function findAllVoices(): VoicePackageRow[] {
  return getDb().prepare('SELECT * FROM voice_packages ORDER BY updated_at DESC, id DESC').all() as VoicePackageRow[];
}

function findAzureVoiceIds(): string[] {
  return (getDb().prepare("SELECT voice_id FROM voice_packages WHERE lower(provider) = 'azure'").all() as { voice_id: string }[])
    .map(r => String(r.voice_id || '').toLowerCase()).filter(Boolean);
}

function findVoiceSignaturesByProvider(provider: string): string[] {
  return (getDb().prepare('SELECT voice_id, style FROM voice_packages WHERE lower(provider) = lower(?)').all(provider) as { voice_id: string; style: string }[])
    .map(row => buildVoiceSignature(row.voice_id, row.style)).filter(Boolean);
}

function buildVoiceSignature(voiceId: string | null | undefined, style: string | null | undefined): string {
  return `${String(voiceId || '').trim().toLowerCase()}::${String(style || '').trim().toLowerCase()}`;
}

function insertVoice(row: InsertVoiceRow): number {
  const result = getDb().prepare(`
    INSERT INTO voice_packages (name, provider, voice_id, language, gender, style, rate, pitch, temperature, sample_text, description, enabled, created_at, updated_at)
    VALUES (@name, @provider, @voice_id, @language, @gender, @style, @rate, @pitch, @temperature, @sample_text, @description, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(row);
  return result.lastInsertRowid as number;
}

function updateVoice(row: UpdateVoiceRow): void {
  getDb().prepare(`
    UPDATE voice_packages
    SET name = @name, provider = @provider, voice_id = @voice_id, language = @language,
        gender = @gender, style = @style, rate = @rate, pitch = @pitch, temperature = @temperature,
        sample_text = @sample_text, description = @description, enabled = @enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(row);
}

function deleteVoiceById(id: string | number): void {
  getDb().prepare('DELETE FROM voice_packages WHERE id = ?').run(Number(id));
}

export { findVoiceById, findAllVoices, findAzureVoiceIds, findVoiceSignaturesByProvider, buildVoiceSignature, insertVoice, updateVoice, deleteVoiceById };
export type { InsertVoiceRow, UpdateVoiceRow };
