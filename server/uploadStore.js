const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RESOURCE_ROOT = path.join(__dirname, 'resources');
const UPLOAD_ROOT = path.join(RESOURCE_ROOT, 'uploads');
const AUDIO_ROOT = path.join(RESOURCE_ROOT, 'audio');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function getResourceRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  fs.mkdirSync(AUDIO_ROOT, { recursive: true });
  return RESOURCE_ROOT;
}

function saveGeneratedAudio(buffer, extension = 'mp3') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('音频内容为空');
  fs.mkdirSync(AUDIO_ROOT, { recursive: true });
  const safeExtension = String(extension || 'mp3').replace(/[^\w]/g, '') || 'mp3';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${safeExtension}`;
  fs.writeFileSync(path.join(AUDIO_ROOT, filename), buffer);
  return { url: `/resources/audio/${filename}` };
}

function saveUploadedImage(input = {}) {
  const { buffer, extension } = parseImageInput(input);
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('图片不能超过 5MB。');
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
  const target = path.join(UPLOAD_ROOT, filename);
  fs.writeFileSync(target, buffer);
  return { url: `/resources/uploads/${filename}` };
}

function getGeneratedAudio(cacheKey, extension = 'mp3') {
  const filename = getAudioCacheFilename(cacheKey, extension);
  if (!filename) return null;
  return fs.existsSync(path.join(AUDIO_ROOT, filename)) ? { url: `/resources/audio/${filename}` } : null;
}

function saveCachedGeneratedAudio(cacheKey, buffer, extension = 'mp3') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('音频内容为空');
  const filename = getAudioCacheFilename(cacheKey, extension);
  if (!filename) return saveGeneratedAudio(buffer, extension);
  fs.mkdirSync(AUDIO_ROOT, { recursive: true });
  const target = path.join(AUDIO_ROOT, filename);
  if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);
  return { url: `/resources/audio/${filename}` };
}

function deleteGeneratedAudioByUrl(url) {
  const text = String(url || '').trim();
  const prefix = '/resources/audio/';
  if (!text.startsWith(prefix)) return false;
  const filename = path.basename(text.slice(prefix.length));
  if (!filename || filename.includes('..')) return false;
  const target = path.resolve(AUDIO_ROOT, filename);
  if (!target.startsWith(path.resolve(AUDIO_ROOT))) return false;
  if (!fs.existsSync(target)) return false;
  fs.unlinkSync(target);
  return true;
}

function getAudioCacheFilename(cacheKey, extension = 'mp3') {
  const text = String(cacheKey || '').trim();
  if (!text) return '';
  const safeExtension = String(extension || 'mp3').replace(/[^\w]/g, '') || 'mp3';
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  return `${hash}.${safeExtension}`;
}

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

module.exports = {
  deleteGeneratedAudioByUrl,
  getGeneratedAudio,
  getResourceRoot,
  saveGeneratedAudio,
  saveCachedGeneratedAudio,
  saveUploadedImage
};
