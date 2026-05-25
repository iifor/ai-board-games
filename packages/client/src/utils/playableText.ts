import type { PlayableTextSegment, PlayableTextOptions } from '../types';

export const PLAYABLE_TEXT_CONFIG: Required<PlayableTextOptions> = {
  maxChars: 50
};

export function stripSpeechParentheses(value: string | null | undefined): string {
  let text = String(value || '');
  let previous = '';
  while (text && text !== previous) {
    previous = text;
    text = text.replace(/\([^()]*\)|（[^（）]*）/g, '');
  }
  return normalizePlayableWhitespace(text);
}

export function splitPlayableTextSegments(value: string, options: PlayableTextOptions = {}): PlayableTextSegment[] {
  const maxChars = Number(options.maxChars) || PLAYABLE_TEXT_CONFIG.maxChars;
  const source = normalizePlayableWhitespace(value);
  if (!source) return [];
  const sentences = source.match(/[^。！？!?；;，,、：:\n]+[。！？!?；;，,、：:]*/g)
    ?.map(trimPlayableSegment)
    .filter(Boolean) || [];
  const chunks = (sentences.length ? sentences : [source]).flatMap((item: string) => splitLongSegment(item, maxChars));
  return chunks.map((displayText: string, index: number) => ({
    index,
    displayText,
    text: displayText,
    speechText: stripSpeechParentheses(displayText)
  })).filter((item: PlayableTextSegment) => item.displayText || item.speechText);
}

export function splitPlayableDisplaySegments(value: string, options: PlayableTextOptions = {}): string[] {
  return splitPlayableTextSegments(value, options).map((item: PlayableTextSegment) => item.displayText);
}

export function getPlayableChunkDelay(text: string): number {
  const length = String(text || '').length;
  return Math.max(1400, Math.min(3600, 900 + length * 70));
}

export function getPlayablePlaybackDelay(text: string, options: PlayableTextOptions = {}): number {
  const chunks = splitPlayableDisplaySegments(text, options);
  if (!chunks.length) return 300;
  const total = chunks.reduce((sum: number, chunk: string) => sum + getPlayableChunkDelay(chunk), 0);
  return Math.max(900, Math.min(16000, total));
}

function splitLongSegment(value: string, maxChars: number): string[] {
  const text = trimPlayableSegment(value);
  if (!text || text.length <= maxChars) return text ? [text] : [];
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    const chunk = trimPlayableSegment(text.slice(index, index + maxChars));
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

function normalizePlayableWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimPlayableSegment(value: string): string {
  return normalizePlayableWhitespace(value).replace(/[。！？!?；;，,、：:]+$/u, '');
}
