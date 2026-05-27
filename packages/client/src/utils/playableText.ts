import type { PlayableTextOptions, PlayableTextSegment } from '../types';

export const PLAYABLE_TEXT_CONFIG: Required<PlayableTextOptions> = {
  maxChars: 50
};

const SENTENCE_BREAK_CHARS = new Set('。！？!?；;');
const SOFT_BREAK_CHARS = new Set('，,、：:');
const BREAK_CHARS = new Set([...SENTENCE_BREAK_CHARS, ...SOFT_BREAK_CHARS]);
const CLOSING_QUOTE_CHARS = new Set('”’」』）)]】》');
const LEADING_PUNCTUATION_RE = /^[。！？!?；;，,、：:]+/u;

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
  const maxChars = Math.max(12, Number(options.maxChars) || PLAYABLE_TEXT_CONFIG.maxChars);
  const source = normalizePlayableWhitespace(value);
  if (!source) return [];

  const sentenceChunks = splitBySentencePunctuation(source)
    .flatMap((sentence) => splitLongSegment(sentence, maxChars));
  const chunks = mergeLeadingPunctuation(sentenceChunks);

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

function splitBySentencePunctuation(value: string): string[] {
  const chunks: string[] = [];
  let current = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    current += char;
    if (!SENTENCE_BREAK_CHARS.has(char)) continue;

    while (index + 1 < value.length && CLOSING_QUOTE_CHARS.has(value[index + 1])) {
      index += 1;
      current += value[index];
    }
    pushChunk(chunks, current);
    current = '';
  }

  pushChunk(chunks, current);
  return chunks;
}

function splitLongSegment(value: string, maxChars: number): string[] {
  const text = trimPlayableSegment(value);
  if (!text || text.length <= maxChars) return text ? [text] : [];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const breakIndex = findPreferredBreakIndex(remaining, maxChars);
    const chunk = trimPlayableSegment(remaining.slice(0, breakIndex));
    if (chunk) chunks.push(chunk);
    remaining = trimPlayableSegment(remaining.slice(breakIndex));
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function findPreferredBreakIndex(value: string, maxChars: number): number {
  const hardLimit = Math.min(value.length, Math.max(maxChars, Math.floor(maxChars * 1.35)));
  const beforeLimit = findLastBreakAtOrBefore(value, maxChars);
  if (beforeLimit > 0) return includeTrailingClosers(value, beforeLimit);

  const afterLimit = findFirstBreakAfter(value, maxChars, hardLimit);
  if (afterLimit > 0) return includeTrailingClosers(value, afterLimit);

  return maxChars;
}

function findLastBreakAtOrBefore(value: string, maxChars: number): number {
  for (let index = Math.min(maxChars - 1, value.length - 1); index >= 0; index -= 1) {
    if (BREAK_CHARS.has(value[index])) return index + 1;
  }
  return -1;
}

function findFirstBreakAfter(value: string, start: number, end: number): number {
  for (let index = Math.max(0, start); index < end; index += 1) {
    if (BREAK_CHARS.has(value[index])) return index + 1;
  }
  return -1;
}

function includeTrailingClosers(value: string, breakIndex: number): number {
  let next = breakIndex;
  while (next < value.length && CLOSING_QUOTE_CHARS.has(value[next])) next += 1;
  return next;
}

function mergeLeadingPunctuation(chunks: string[]): string[] {
  const result: string[] = [];
  for (const raw of chunks) {
    let chunk = trimPlayableSegment(raw);
    if (!chunk) continue;

    const leading = chunk.match(LEADING_PUNCTUATION_RE)?.[0] || '';
    if (leading && result.length) {
      result[result.length - 1] = `${result[result.length - 1]}${leading}`;
      chunk = trimPlayableSegment(chunk.slice(leading.length));
    } else if (leading) {
      chunk = trimPlayableSegment(chunk.replace(LEADING_PUNCTUATION_RE, ''));
    }
    if (chunk) result.push(chunk);
  }
  return result;
}

function pushChunk(chunks: string[], value: string): void {
  const chunk = trimPlayableSegment(value);
  if (chunk) chunks.push(chunk);
}

function normalizePlayableWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimPlayableSegment(value: string): string {
  return normalizePlayableWhitespace(value);
}
