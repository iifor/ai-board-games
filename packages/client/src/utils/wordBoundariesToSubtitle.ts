import type { SpeechWordBoundary } from '@consensus-mist/shared/types/speechTypes';
import type { NormalizedWord, SubtitleCue, SubtitleTimeline } from '../types';

interface SubtitleConfig {
  minCharsPerCue: number;
  targetMinCharsPerCue: number;
  maxCharsPerCue: number;
  maxDurationMs: number;
  leadMs: number;
  tailMs: number;
}

const SUBTITLE_CONFIG: SubtitleConfig = {
  minCharsPerCue: 8,
  targetMinCharsPerCue: 15,
  maxCharsPerCue: 30,
  maxDurationMs: 4000,
  leadMs: 80,
  tailMs: 160
};

const STRONG_PUNCTUATION = new Set(['。', '！', '？', '!', '?', '；', ';']);
const SOFT_PUNCTUATION = new Set(['，', ',', '、', '：', ':']);

export function buildSpeechSubtitleTimeline(
  text: string,
  wordBoundaries?: SpeechWordBoundary[] | null,
  options: Partial<SubtitleConfig> = {}
): SubtitleTimeline {
  const fullText = normalizeText(text);
  const words = normalizeWords(wordBoundaries || []);
  if (!words.length) return { fullText, cues: [] };

  const config = { ...SUBTITLE_CONFIG, ...options };
  const rawCues: SubtitleCue[] = [];
  let current: NormalizedWord[] = [];

  for (const word of words) {
    current.push(word);

    const currentText = joinWords(current);
    const length = getReadableLength(currentText);
    const duration = getCueDuration(current);

    if (
      shouldBreakAtStrongPunctuation(word, length, config) ||
      shouldBreakAtSoftPunctuation(word, length, config)
    ) {
      pushCue(rawCues, current, config);
      current = [];
      continue;
    }

    if (length >= config.maxCharsPerCue || duration >= config.maxDurationMs) {
      const breakIndex = findPreferredBreakIndex(current, config);
      if (breakIndex >= 0 && breakIndex < current.length - 1) {
        pushCue(rawCues, current.slice(0, breakIndex + 1), config);
        current = current.slice(breakIndex + 1);
      } else {
        pushCue(rawCues, current, config);
        current = [];
      }
    }
  }

  pushCue(rawCues, current, config);
  return { fullText, cues: normalizeCueLengths(rawCues, config) };
}

export function findActiveCue(cues: SubtitleCue[] = [], currentTimeMs: number = 0): SubtitleCue | null {
  if (!cues.length) return null;
  const time = normalizeTime(currentTimeMs);
  let latest = cues[0];

  for (const cue of cues) {
    if (time >= cue.startMs && time <= cue.endMs) return cue;
    if (time >= cue.startMs) latest = cue;
    else break;
  }

  return latest;
}

export function findActiveWord(cue: SubtitleCue | null | undefined, currentTimeMs: number = 0): NormalizedWord | null {
  if (!cue?.words?.length) return null;
  const time = normalizeTime(currentTimeMs);
  let latest: NormalizedWord | null = null;

  for (const word of cue.words) {
    if (time >= word.startMs && time <= word.endMs) {
      return isPunctuationWord(word) ? latest : word;
    }
    if (time >= word.startMs) {
      if (!isPunctuationWord(word)) latest = word;
      continue;
    }
    break;
  }

  return latest;
}

export function getWordPlaybackState(word: NormalizedWord, activeWord: NormalizedWord | null): string {
  if (isPunctuationWord(word)) return 'punctuation';
  if (!word || !activeWord) return 'upcoming';
  if (word.index === activeWord.index) return 'active';
  return word.index < activeWord.index ? 'past' : 'upcoming';
}

export function isPunctuationWord(word: NormalizedWord): boolean {
  return /^[\s。！？；;!?,，、：:,.…]+$/.test(String(word?.text || ''));
}

function normalizeWords(wordBoundaries: SpeechWordBoundary[]): NormalizedWord[] {
  return (Array.isArray(wordBoundaries) ? wordBoundaries : [])
    .map((boundary, index) => {
      const text = normalizeText(boundary?.text);
      const startMs = normalizeTime(boundary?.offset);
      const duration = Math.max(0, normalizeTime(boundary?.duration));
      return {
        index,
        text,
        startMs,
        endMs: startMs + duration
      };
    })
    .filter((word) => word.text);
}

function pushCue(cues: SubtitleCue[], words: NormalizedWord[], config: SubtitleConfig): void {
  if (!words.length) return;
  const text = joinWords(words);
  cues.push({
    id: `cue-${cues.length}`,
    text,
    startMs: Math.max(0, words[0].startMs - config.leadMs),
    endMs: words[words.length - 1].endMs + config.tailMs,
    words: [...words]
  });
}

function normalizeCueLengths(cues: SubtitleCue[], config: SubtitleConfig): SubtitleCue[] {
  const normalized: SubtitleCue[] = [];

  for (const cue of cues) {
    const cueLength = getReadableLength(cue.text);
    const previous = normalized[normalized.length - 1];
    if (previous && cueLength < config.minCharsPerCue) {
      normalized[normalized.length - 1] = mergeCues(previous, cue);
    } else {
      normalized.push(cue);
    }
  }

  if (
    normalized.length > 1 &&
    getReadableLength(normalized[0].text) < config.minCharsPerCue
  ) {
    const [first, second, ...rest] = normalized;
    return [mergeCues(first, second), ...rest].map(reindexCue);
  }

  return normalized.map(reindexCue);
}

function mergeCues(left: SubtitleCue, right: SubtitleCue): SubtitleCue {
  const words = [...left.words, ...right.words];
  return {
    ...left,
    text: joinWords(words),
    endMs: right.endMs,
    words
  };
}

function reindexCue(cue: SubtitleCue, index: number): SubtitleCue {
  return { ...cue, id: `cue-${index}` };
}

function shouldBreakAtStrongPunctuation(word: NormalizedWord, length: number, config: SubtitleConfig): boolean {
  return STRONG_PUNCTUATION.has(word.text) && length >= config.minCharsPerCue;
}

function shouldBreakAtSoftPunctuation(word: NormalizedWord, length: number, config: SubtitleConfig): boolean {
  return SOFT_PUNCTUATION.has(word.text) && length >= config.targetMinCharsPerCue;
}

function findPreferredBreakIndex(words: NormalizedWord[], config: SubtitleConfig): number {
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index];
    const leadingText = joinWords(words.slice(0, index + 1));
    const leadingLength = getReadableLength(leadingText);
    if (
      leadingLength >= config.targetMinCharsPerCue &&
      (SOFT_PUNCTUATION.has(word.text) || STRONG_PUNCTUATION.has(word.text))
    ) {
      return index;
    }
  }
  return -1;
}

function getCueDuration(words: NormalizedWord[]): number {
  if (!words.length) return 0;
  return words[words.length - 1].endMs - words[0].startMs;
}

function joinWords(words: NormalizedWord[]): string {
  return words.map((word) => word.text).join('');
}

function getReadableLength(text: string): number {
  return normalizeText(text).replace(/\s+/g, '').length;
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTime(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
