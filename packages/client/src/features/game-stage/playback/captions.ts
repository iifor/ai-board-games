import { captionTextChunks, stripSpeechTags, type AudioCaptionCue } from '@battle/shared';

export interface CaptionCue {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export function sentenceCues(text: string): readonly CaptionCue[] {
  const lines = captionTextChunks(stripSpeechTags(text));
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

/** 时间轴的空隙继续保留上一句，下一句只在真实起始时间到达时出现。 */
export function captionIndexAtTime(cues: readonly AudioCaptionCue[], positionMs: number): number {
  if (!Number.isFinite(positionMs)) return -1;
  let index = -1;
  for (let candidate = 0; candidate < cues.length; candidate++) {
    if (cues[candidate]!.startMs > positionMs) break;
    index = candidate;
  }
  return index;
}
