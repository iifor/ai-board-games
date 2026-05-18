const { getGeneratedAudio, saveCachedGeneratedAudio } = require('../../uploadStore');
const { synthesizeVoicePreview } = require('../../voicePreview');

async function prepareVoiceAudio(voice, text) {
  const content = String(text || '').trim();
  if (!content || !isAzureVoice(voice)) return null;

  const cacheKey = buildAudioCacheKey(voice, content);
  const cached = getGeneratedAudio(cacheKey, 'mp3');
  if (cached) {
    return {
      audioUrl: cached.url,
      audioMimeType: 'audio/mpeg',
      audioCached: true
    };
  }

  const audio = await synthesizeVoicePreview(voice, content);
  const saved = saveCachedGeneratedAudio(cacheKey, audio.buffer, 'mp3');
  return {
    audioUrl: saved.url,
    audioMimeType: audio.mimeType || 'audio/mpeg',
    audioCached: false
  };
}

function isAzureVoice(voice) {
  return Boolean(voice?.enabled) && String(voice.provider || '').toLowerCase() === 'azure';
}

function buildAudioCacheKey(voice, text) {
  return JSON.stringify({
    provider: voice.provider,
    voiceId: voice.voiceId,
    language: voice.language,
    style: voice.style,
    rate: voice.rate,
    pitch: voice.pitch,
    text: String(text || '').trim()
  });
}

module.exports = {
  buildAudioCacheKey,
  isAzureVoice,
  prepareVoiceAudio
};
