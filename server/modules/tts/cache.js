const fs = require('fs');
const path = require('path');
const upload = require('../upload/service');
const { synthesizeVoicePreview } = require('./service');
const { isAzureVoice, buildAudioCacheKey } = require('./utils');

async function prepareVoiceAudio(voice, text, gameId = null) {
  const content = String(text || '').trim();
  if (!content || !isAzureVoice(voice)) return null;

  const cacheKey = buildAudioCacheKey(voice, content);
  const cached = upload.getGeneratedAudio(cacheKey, 'mp3', gameId);
  if (cached) {
    const boundaries = loadWordBoundaries(cacheKey, gameId);
    return {
      audioUrl: cached.url,
      audioMimeType: 'audio/mpeg',
      audioCached: true,
      wordBoundaries: boundaries.length ? boundaries : null
    };
  }

  const audio = await synthesizeVoicePreview(voice, content, { collectWordBoundaries: true });
  const saved = upload.saveCachedGeneratedAudio(cacheKey, audio.buffer, 'mp3', gameId);
  if (audio.wordBoundaries?.length) {
    saveWordBoundaries(cacheKey, audio.wordBoundaries, gameId);
  }
  return {
    audioUrl: saved.url,
    audioMimeType: audio.mimeType || 'audio/mpeg',
    audioCached: false,
    wordBoundaries: audio.wordBoundaries?.length ? audio.wordBoundaries : null
  };
}

function saveWordBoundaries(cacheKey, boundaries, gameId) {
  const filename = `${getCacheHash(cacheKey)}.json`;
  const dir = upload.resolveAudioDir(gameId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(boundaries));
}

function loadWordBoundaries(cacheKey, gameId) {
  const filename = `${getCacheHash(cacheKey)}.json`;
  const dir = upload.resolveAudioDir(gameId);
  try {
    const raw = fs.readFileSync(path.join(dir, filename), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function getCacheHash(cacheKey) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(String(cacheKey || '')).digest('hex');
}

module.exports = { prepareVoiceAudio, isAzureVoice, buildAudioCacheKey };
