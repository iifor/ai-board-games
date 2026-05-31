import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as upload from '../upload/service';
import { synthesizeVoicePreview } from './service';
import { isAzureVoice, isServerTtsVoice, buildAudioCacheKey } from './utils';
import type { VoicePackage, WordBoundary } from './utils';

interface VoiceAudioResult {
  audioUrl: string;
  audioMimeType: string;
  audioCached: boolean;
  wordBoundaries: WordBoundary[] | null;
}

async function prepareVoiceAudio(
  voice: VoicePackage,
  text: string,
  gameId: string | null = null
): Promise<VoiceAudioResult | null> {
  const content = String(text || '').trim();
  if (!content || !isServerTtsVoice(voice)) return null;

  const cacheKey = buildAudioCacheKey(voice, content);
  const extension = getVoiceAudioExtension(voice);
  const cached = upload.getGeneratedAudio(cacheKey, extension, gameId);
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
  const saved = upload.saveCachedGeneratedAudio(cacheKey, audio.buffer, extension, gameId);
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

function saveWordBoundaries(cacheKey: string, boundaries: WordBoundary[], gameId: string | null): void {
  const filename = `${getCacheHash(cacheKey)}.json`;
  const dir = upload.resolveAudioDir(gameId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(boundaries));
}

function loadWordBoundaries(cacheKey: string, gameId: string | null): WordBoundary[] {
  const filename = `${getCacheHash(cacheKey)}.json`;
  const dir = upload.resolveAudioDir(gameId);
  try {
    const raw = fs.readFileSync(path.join(dir, filename), 'utf-8');
    return JSON.parse(raw) as WordBoundary[];
  } catch {
    return [];
  }
}

function getCacheHash(cacheKey: string): string {
  return crypto.createHash('sha256').update(String(cacheKey || '')).digest('hex');
}

function getVoiceAudioExtension(voice: VoicePackage): string {
  if (String(voice.provider || '').toLowerCase() === 'mimo') {
    const format = String(process.env.MIMO_TTS_FORMAT || 'mp3').toLowerCase();
    if (['mp3', 'wav', 'opus'].includes(format)) return format;
  }
  return 'mp3';
}

export { prepareVoiceAudio, isAzureVoice, isServerTtsVoice, buildAudioCacheKey };
