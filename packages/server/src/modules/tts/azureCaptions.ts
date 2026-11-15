import { captionTextChunks, type AudioCaptionCue } from '@battle/shared';
import type { AzureWordBoundary } from './azureTransport';

/** 仅在 Azure 时间信息能覆盖完整正文时返回时间轴，避免给部分对齐结果标上精确时间。 */
export function azureCaptionCues(text: string, words: readonly AzureWordBoundary[]): AudioCaptionCue[] | undefined {
  if (!text.trim() || !words.length) return undefined;
  const aligned: Array<AzureWordBoundary & { start: number; end: number }> = [];
  let position = 0;
  let previousTime = -1;
  for (const word of words) {
    if (!word.text.trim()) continue;
    if (!Number.isFinite(word.startMs) || !Number.isFinite(word.endMs) || word.startMs < previousTime || word.endMs < word.startMs || word.startMs < 0) return undefined;
    const start = text.indexOf(word.text, position);
    if (start < 0 || /[\p{L}\p{N}]/u.test(text.slice(position, start))) return undefined;
    const end = start + word.text.length;
    aligned.push({ ...word, start, end });
    position = end;
    previousTime = word.startMs;
  }
  if (/[\p{L}\p{N}]/u.test(text.slice(position))) return undefined;
  const cues: AudioCaptionCue[] = [];
  position = 0;
  for (const chunk of captionTextChunks(text)) {
    const start = text.indexOf(chunk, position);
    const end = start + chunk.length;
    const covered = aligned.filter(word => word.end > start && word.start < end);
    const first = covered[0];
    const last = covered.at(-1);
    if (start < 0 || !first || !last) return undefined;
    const previous = cues.at(-1);
    if (previous && first.startMs <= previous.startMs) {
      cues[cues.length - 1] = { text: previous.text + chunk, startMs: previous.startMs, endMs: last.endMs };
    } else {
      cues.push({ text: chunk, startMs: Math.round(first.startMs), endMs: Math.round(last.endMs) });
    }
    position = end;
  }
  return cues.length ? cues : undefined;
}
