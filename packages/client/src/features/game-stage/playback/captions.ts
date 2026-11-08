export interface CaptionCue {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const sentenceSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'sentence' });
const MAX_CAPTION_LENGTH = 42;

/** 优先按句子分段，较长的句子在逗号或空格处分成可读的字幕。 */
export function sentenceCues(text: string): readonly CaptionCue[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    for (const { segment } of sentenceSegmenter.segment(paragraph)) {
      const characters = Array.from(segment.trim());
      while (characters.length > MAX_CAPTION_LENGTH) {
        const candidate = characters.slice(0, MAX_CAPTION_LENGTH);
        const punctuation = candidate.findLastIndex((character) => /[，,、：:；;\s]/u.test(character));
        const end = punctuation >= MAX_CAPTION_LENGTH / 2 ? punctuation + 1 : MAX_CAPTION_LENGTH;
        lines.push(characters.splice(0, end).join('').trim());
      }
      const rest = characters.join('').trim();
      if (rest) lines.push(rest);
    }
  }
  const lengths = lines.map((line) => Array.from(line.replace(/\s/gu, '')).length + 2);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let position = 0;
  return lines.map((line, index) => {
    const start = position / total;
    position += lengths[index] ?? 0;
    return { text: line, start, end: position / total };
  });
}

export function captionIndexAt(cues: readonly CaptionCue[], fraction: number): number {
  if (!cues.length) return -1;
  const progress = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  const index = cues.findIndex((cue) => progress < cue.end);
  return index < 0 ? cues.length - 1 : index;
}
