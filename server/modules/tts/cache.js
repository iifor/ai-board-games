const upload = require('../upload/service');
const { synthesizeVoicePreview } = require('./service');
const { isAzureVoice, buildAudioCacheKey } = require('./utils');

async function prepareVoiceAudio(voice, text) {
  const content = String(text || '').trim();
  if (!content || !isAzureVoice(voice)) return null;

  const cacheKey = buildAudioCacheKey(voice, content);
  const cached = upload.getGeneratedAudio(cacheKey, 'mp3');
  if (cached) {
    return {
      audioUrl: cached.url,
      audioMimeType: 'audio/mpeg',
      audioCached: true
    };
  }

  const audio = await synthesizeVoicePreview(voice, content);
  const saved = upload.saveCachedGeneratedAudio(cacheKey, audio.buffer, 'mp3');
  return {
    audioUrl: saved.url,
    audioMimeType: audio.mimeType || 'audio/mpeg',
    audioCached: false
  };
}

module.exports = { prepareVoiceAudio, isAzureVoice, buildAudioCacheKey };
