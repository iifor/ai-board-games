const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'sentence' });
const MAX_LENGTH = 42;

/** 两端共用的可读字幕片段，优先保留句子与逗号边界。 */
export function captionTextChunks(text: string): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    for (const { segment } of segmenter.segment(paragraph)) {
      const characters = Array.from(segment.trim());
      while (characters.length > MAX_LENGTH) {
        const candidate = characters.slice(0, MAX_LENGTH);
        const punctuation = candidate.findLastIndex(character => /[，,、：:；;\s]/u.test(character));
        const end = punctuation >= MAX_LENGTH / 2 ? punctuation + 1 : MAX_LENGTH;
        lines.push(characters.splice(0, end).join('').trim());
      }
      const rest = characters.join('').trim();
      if (rest) lines.push(rest);
    }
  }
  return lines;
}
