const { synthesizeVoiceMedia, synthesizeVoicePreview } = require('./service');
const { prepareVoiceAudio, isAzureVoice, buildAudioCacheKey } = require('./cache');
const utils = require('./utils');

module.exports = {
  synthesizeVoicePreview,
  synthesizeVoiceMedia,
  prepareVoiceAudio,
  isAzureVoice,
  buildAudioCacheKey,
  ...utils
};
