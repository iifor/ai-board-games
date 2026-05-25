import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { RESOURCE_ROOT, UPLOAD_ROOT, AUDIO_ROOT, MAX_IMAGE_BYTES } from './constants';
import type { ImageInput } from './utils';
import { parseImageInput, getAudioCacheFilename } from './utils';

interface FileUrl {
  url: string;
}

function getResourceRoot(): string {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  fs.mkdirSync(AUDIO_ROOT, { recursive: true });
  return RESOURCE_ROOT;
}

function saveGeneratedAudio(
  buffer: Buffer,
  extension: string = 'mp3',
  gameId: string | null = null,
): FileUrl {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('音频内容为空');
  const dir = resolveAudioDir(gameId);
  fs.mkdirSync(dir, { recursive: true });
  const safeExtension = String(extension || 'mp3').replace(/[^\w]/g, '') || 'mp3';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${safeExtension}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  const prefix = gameId ? `/resources/audio/${gameId}` : '/resources/audio';
  return { url: `${prefix}/${filename}` };
}

function saveUploadedImage(input: ImageInput = {}): FileUrl {
  const { buffer, extension } = parseImageInput(input);
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('图片不能超过 5MB。');
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
  const target = path.join(UPLOAD_ROOT, filename);
  fs.writeFileSync(target, buffer);
  return { url: `/resources/uploads/${filename}` };
}

function getGeneratedAudio(
  cacheKey: string,
  extension: string = 'mp3',
  gameId: string | null = null,
): FileUrl | null {
  const filename = getAudioCacheFilename(cacheKey, extension);
  if (!filename) return null;
  const dir = resolveAudioDir(gameId);
  return fs.existsSync(path.join(dir, filename))
    ? { url: `${gameId ? `/resources/audio/${gameId}` : '/resources/audio'}/${filename}` }
    : null;
}

function saveCachedGeneratedAudio(
  cacheKey: string,
  buffer: Buffer,
  extension: string = 'mp3',
  gameId: string | null = null,
): FileUrl {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('音频内容为空');
  const filename = getAudioCacheFilename(cacheKey, extension);
  if (!filename) return saveGeneratedAudio(buffer, extension, gameId);
  const dir = resolveAudioDir(gameId);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, filename);
  if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);
  const prefix = gameId ? `/resources/audio/${gameId}` : '/resources/audio';
  return { url: `${prefix}/${filename}` };
}

function resolveAudioDir(gameId: string | null): string {
  if (!gameId) return AUDIO_ROOT;
  const safe = String(gameId).replace(/[^\w-]/g, '');
  return path.join(AUDIO_ROOT, safe);
}

function deleteGeneratedAudioByUrl(url: string): boolean {
  const text = String(url || '').trim();
  const prefix = '/resources/audio/';
  if (!text.startsWith(prefix)) return false;
  const subPath = text.slice(prefix.length);
  if (!subPath || subPath.includes('..')) return false;
  const target = path.resolve(AUDIO_ROOT, subPath);
  if (!target.startsWith(path.resolve(AUDIO_ROOT))) return false;
  if (!fs.existsSync(target)) return false;
  fs.unlinkSync(target);
  return true;
}

function deleteGameAudioDirectory(gameId: string): boolean {
  if (!gameId) return false;
  const dir = resolveAudioDir(gameId);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export {
  deleteGeneratedAudioByUrl,
  deleteGameAudioDirectory,
  getGeneratedAudio,
  getResourceRoot,
  resolveAudioDir,
  saveGeneratedAudio,
  saveCachedGeneratedAudio,
  saveUploadedImage,
};
export type { FileUrl };
