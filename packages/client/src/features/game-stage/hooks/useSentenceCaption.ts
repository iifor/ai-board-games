import { useCallback, useEffect, useMemo, useState } from 'react';
import { stripSpeechTags, type AudioCaptionCue } from '@battle/shared';
import { captionIndexAt, captionIndexAtTime, sentenceCues } from '../playback/captions';
import { progressFraction, type SegmentControl } from '../playback/segment';

/** 音频使用实际播放进度，无音频时使用播放器的计时进度估算当前一句。 */
export function useSentenceCaption(text: string, control: SegmentControl | null, captions?: readonly AudioCaptionCue[]) {
  const cues = useMemo(() => sentenceCues(text), [text]);
  const current = useCallback(() => {
    const progress = control?.progress;
    if (captions?.length && progress?.kind === 'measured' && progress.positionMs !== undefined) {
      const index = captionIndexAtTime(captions, progress.positionMs);
      return { index, text: stripSpeechTags(captions[index]?.text ?? '') };
    }
    const index = captionIndexAt(cues, control ? progressFraction(control.progress, Date.now()) : 1);
    return { index, text: cues[index]?.text ?? '' };
  }, [captions, control, cues]);
  const [sentence, setSentence] = useState(current);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      const progress = control?.progress ?? null;
      const fraction = control ? progressFraction(progress, Date.now()) : 1;
      const next = current();
      setSentence(previous => previous.index === next.index && previous.text === next.text ? previous : next);
      if (progress?.kind !== 'timed' || fraction >= 1) return;
      const cue = cues[next.index];
      if (!cue) return;
      const remainingFraction = 1 - progress.fraction;
      const duration = remainingFraction > 0 ? progress.remainingMs / remainingFraction : 0;
      timer = setTimeout(update, Math.max(20, (cue.end - fraction) * duration + 1));
    };
    update();
    const unsubscribe = control?.subscribe(update);
    return () => {
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [control, cues, current]);
  return sentence;
}
