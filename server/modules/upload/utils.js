const crypto = require('crypto');
const { AUDIO_ROOT } = require('./constants');

function parseImageInput(input) {
  const dataUrl = String(input.dataUrl || input.data || '').trim();
  if (!dataUrl) throw new Error('缺少图片 dataUrl。');
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error('只支持 png、jpg、jpeg、webp、gif 图片。');
  const mimeType = match[1].toLowerCase();
  return {
    buffer: Buffer.from(match[2], 'base64'),
    extension: mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : mimeType.split('/')[1]
  };
}

function getAudioCacheFilename(cacheKey, extension = 'mp3') {
  const text = String(cacheKey || '').trim();
  if (!text) return '';
  const safeExtension = String(extension || 'mp3').replace(/[^\w]/g, '') || 'mp3';
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  return `${hash}.${safeExtension}`;
}

module.exports = { parseImageInput, getAudioCacheFilename };
