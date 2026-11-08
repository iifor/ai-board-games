import { useEffect, useMemo, useState } from 'react';
import { captionIndexAt, sentenceCues } from '../playback/captions';
import { progressFraction, type SegmentControl } from '../playback/segment';

/** 音频使用实际播放进度，无音频时使用播放器的计时进度估算当前一句。 */
export function useSentenceCaption(text: string, control: SegmentControl | null) {
  const cues = useMemo(() => sentenceCues(text), [text]);
  const [index, setIndex] = useState(() => captionIndexAt(cues, control ? progressFraction(control.progress, Date.now()) : 1));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      const progress = control?.progress ?? null;
      const fraction = control ? progressFraction(progress, Date.now()) : 1;
      const current = captionIndexAt(cues, fraction);
      setIndex(current);
      if (progress?.kind !== 'timed' || fraction >= 1) return;
      const cue = cues[current];
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
  }, [control, cues]);
  return { text: cues[index]?.text ?? '', index };
}
