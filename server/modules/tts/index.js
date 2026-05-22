const { synthesizeVoicePreview } = require('./service');
const { prepareVoiceAudio, isAzureVoice, buildAudioCacheKey } = require('./cache');
const utils = require('./utils');

module.exports = {
  synthesizeVoicePreview,
  prepareVoiceAudio,
  isAzureVoice,
  buildAudioCacheKey,
  ...utils
};
