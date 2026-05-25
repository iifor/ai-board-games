import * as repo from './repository';
import { rowToVoicePackage, voicePackageToRow } from './utils';
import { DEFAULT_VOICE_PACKAGES, DEFAULT_AZURE_VOICE_PACKAGES } from './constants';
import { AppError, ErrorCodes } from '../../utils/errors';
import { synthesizeVoicePreview } from '../tts';
import type { VoicePackage } from '../../types/api';
import type { VoicePackageInput } from './utils';

interface VoicePreviewResult {
  buffer: Buffer;
  mimeType: string;
}

function listVoicePackages(): VoicePackage[] {
  return repo.findAllVoices().map(rowToVoicePackage).filter((v): v is VoicePackage => v !== null);
}

function getVoicePackage(id: string | number): VoicePackage | null {
  return rowToVoicePackage(repo.findVoiceById(id));
}

function createVoicePackage(input: VoicePackageInput): VoicePackage {
  const row = voicePackageToRow(input);
  if (!row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '语音包名称必填', 400);
  const id = repo.insertVoice(row);
  return getVoicePackage(id)!;
}

function updateVoicePackage(id: string | number, input: VoicePackageInput): VoicePackage {
  if (!repo.findVoiceById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '语音包不存在', 404);
  const row = { ...voicePackageToRow(input), id: Number(id) };
  repo.updateVoice(row);
  return getVoicePackage(id)!;
}

function deleteVoicePackage(id: string | number): { ok: boolean } {
  const players = require('../players/repository') as { nullifyPlayerVoiceRefs: (id: string | number) => void };
  players.nullifyPlayerVoiceRefs(id);
  repo.deleteVoiceById(id);
  return { ok: true };
}

async function previewVoice(id: string | number, text?: string): Promise<VoicePreviewResult> {
  const voice = getVoicePackage(id);
  if (!voice) throw new AppError(ErrorCodes.NOT_FOUND, '语音包不存在', 404);
  return synthesizeVoicePreview(voice, text) as Promise<VoicePreviewResult>;
}

function seedMissingAzureVoices(): void {
  const existingIds = new Set(repo.findAzureVoiceIds());
  DEFAULT_AZURE_VOICE_PACKAGES.forEach((voice) => {
    const voiceId = String(voice.voiceId || '').toLowerCase();
    if (!voiceId || existingIds.has(voiceId)) return;
    createVoicePackage(voice);
    existingIds.add(voiceId);
  });
}

function seedVoicePackages(): void {
  DEFAULT_VOICE_PACKAGES.forEach((v) => createVoicePackage(v));
}

export { listVoicePackages, getVoicePackage, createVoicePackage, updateVoicePackage, deleteVoicePackage, previewVoice, seedMissingAzureVoices, seedVoicePackages };
