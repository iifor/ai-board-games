const repo = require('./repository');
const { rowToVoicePackage, voicePackageToRow } = require('./utils');
const { DEFAULT_VOICE_PACKAGES, DEFAULT_AZURE_VOICE_PACKAGES } = require('./constants');
const { AppError, ErrorCodes } = require('../../utils/errors');
const { synthesizeVoicePreview } = require('../tts');

function listVoicePackages() {
  return repo.findAllVoices().map(rowToVoicePackage);
}

function getVoicePackage(id) {
  return rowToVoicePackage(repo.findVoiceById(id));
}

function createVoicePackage(input) {
  const row = voicePackageToRow(input);
  if (!row.name) throw new AppError(ErrorCodes.VALIDATION_ERROR, '语音包名称必填', 400);
  const id = repo.insertVoice(row);
  return getVoicePackage(id);
}

function updateVoicePackage(id, input) {
  if (!repo.findVoiceById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '语音包不存在', 404);
  const row = { ...voicePackageToRow(input), id: Number(id) };
  repo.updateVoice(row);
  return getVoicePackage(id);
}

function deleteVoicePackage(id) {
  const players = require('../players/repository');
  players.nullifyPlayerVoiceRefs(id);
  repo.deleteVoiceById(id);
  return { ok: true };
}

async function previewVoice(id, text) {
  const voice = getVoicePackage(id);
  if (!voice) throw new AppError(ErrorCodes.NOT_FOUND, '语音包不存在', 404);
  return synthesizeVoicePreview(voice, text);
}

function seedMissingAzureVoices() {
  const existingIds = new Set(repo.findAzureVoiceIds());
  DEFAULT_AZURE_VOICE_PACKAGES.forEach((voice) => {
    const voiceId = String(voice.voiceId || '').toLowerCase();
    if (!voiceId || existingIds.has(voiceId)) return;
    createVoicePackage(voice);
    existingIds.add(voiceId);
  });
}

function seedVoicePackages() {
  DEFAULT_VOICE_PACKAGES.forEach((v) => createVoicePackage(v));
}

module.exports = { listVoicePackages, getVoicePackage, createVoicePackage, updateVoicePackage, deleteVoicePackage, previewVoice, seedMissingAzureVoices, seedVoicePackages };
