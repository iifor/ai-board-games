import * as repo from './repository';
import { rowToVoicePackage, voicePackageToRow } from './utils';
import { DEFAULT_VOICE_PACKAGES, DEFAULT_AZURE_VOICE_PACKAGES, DEFAULT_MIMO_VOICE_PACKAGES } from './constants';
import { AppError, ErrorCodes } from '../../utils/errors';
import { synthesizeVoicePreview } from '../tts';
import type { VoicePackage } from '../../types/api';
import type { VoicePackageInput } from './utils';

interface VoicePreviewResult { buffer: Buffer; mimeType: string }
async function listVoicePackages(): Promise<VoicePackage[]> {
  return (await repo.findAllVoices()).map(rowToVoicePackage).filter((voice): voice is VoicePackage => voice !== null);
}
async function getVoicePackage(id: string | number): Promise<VoicePackage | null> {
  return rowToVoicePackage(await repo.findVoiceById(id));
}
async function createVoicePackage(input: VoicePackageInput): Promise<VoicePackage> {
  const row = voicePackageToRow(input);
  if (!row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '语音包名称必填', 400);
  return (await getVoicePackage(await repo.insertVoice(row)))!;
}
async function updateVoicePackage(id: string | number, input: VoicePackageInput): Promise<VoicePackage> {
  if (!await repo.findVoiceById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '语音包不存在', 404);
  await repo.updateVoice({ ...voicePackageToRow(input), id: Number(id) });
  return (await getVoicePackage(id))!;
}
async function deleteVoicePackage(id: string | number): Promise<{ ok: boolean }> {
  const players = require('../players/repository') as typeof import('../players/repository');
  await players.nullifyPlayerVoiceRefs(id);
  await repo.deleteVoiceById(id);
  return { ok: true };
}
async function previewVoice(id: string | number, text?: string): Promise<VoicePreviewResult> {
  const voice = await getVoicePackage(id);
  if (!voice) throw new AppError(ErrorCodes.NOT_FOUND, '语音包不存在', 404);
  return synthesizeVoicePreview(voice, text) as Promise<VoicePreviewResult>;
}
async function seedMissingAzureVoices(): Promise<void> {
  const existingIds = new Set(await repo.findAzureVoiceIds());
  for (const voice of DEFAULT_AZURE_VOICE_PACKAGES) {
    const voiceId = String(voice.voiceId || '').toLowerCase();
    if (!voiceId || existingIds.has(voiceId)) continue;
    await createVoicePackage(voice);
    existingIds.add(voiceId);
  }
}
async function seedMissingMimoVoices(): Promise<void> {
  const existingSignatures = new Set(await repo.findVoiceSignaturesByProvider('mimo'));
  for (const voice of DEFAULT_MIMO_VOICE_PACKAGES) {
    const signature = repo.buildVoiceSignature(voice.voiceId, voice.style);
    if (!signature || existingSignatures.has(signature)) continue;
    await createVoicePackage(voice);
    existingSignatures.add(signature);
  }
}
async function seedVoicePackages(): Promise<void> {
  for (const voice of DEFAULT_VOICE_PACKAGES) await createVoicePackage(voice);
}

export { listVoicePackages, getVoicePackage, createVoicePackage, updateVoicePackage,
  deleteVoicePackage, previewVoice, seedMissingAzureVoices, seedMissingMimoVoices, seedVoicePackages };
