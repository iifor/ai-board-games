import type { AudienceView } from '@battle/shared';
import { useEffect, useRef, useState } from 'react';
import { describeEvent, shouldSpeak } from '../playback/describe';
import { dwell, playAudio, speak } from '../playback/media';
import { SegmentControl } from '../playback/segment';
import type { PlaybackOptions, StreamItem } from '../types';

interface Segment {
  readonly item: StreamItem;
  readonly control: SegmentControl;
}

/** 一段内容怎么播：有音频播音频，否则浏览器朗读或按字数停留；静音时全部按字数停留 */
function present(item: StreamItem, control: SegmentControl): Promise<void> {
  const { text } = describeEvent(item.event);
  if (!control.muted && item.audio) return playAudio(item.audio.url, control, text);
  if (!control.muted && text && shouldSpeak(item.event)) return speak(text, control);
  return dwell(control, text);
}

/**
 * 依次播放收到的事件：有音频播音频，否则浏览器朗读或按字数停留；
 * 每个事件播放完才 ack，服务端据此推进下一个。暂停时不再开始新的事件。
 * 倍速与静音通过 SegmentControl 实时作用于正在播放的这段。
 */
export function usePlayback(items: readonly StreamItem[], ack: (seq: number) => void, options: PlaybackOptions) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState<Segment | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const controlRef = useRef<SegmentControl | null>(null);

  // 只在卸载或换了一局时中止正在播放的事件；收到新事件不能打断当前播放
  const firstSeq = items[0]?.event.seq;
  useEffect(() => {
    setIndex(0);
    setPlaying(null);
    return () => controlRef.current?.abort();
  }, [firstSeq]);

  // 倍速与静音立即作用于正在播放的这段；取消静音只对下一段生效（已停掉的音频不再续播）
  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    control.setRate(options.speed);
    if (options.muted) control.mute();
  }, [options.speed, options.muted]);

  useEffect(() => {
    const next = items[index];
    if (!next || playing || options.paused) return;
    const control = new SegmentControl(optionsRef.current.speed, optionsRef.current.muted);
    controlRef.current = control;
    setPlaying({ item: next, control });
    void present(next, control).then(() => {
      if (control.signal.aborted) return;
      ack(next.event.seq);
      setPlaying(null);
      setIndex((value) => value + 1);
    });
  }, [items, index, playing, options.paused, ack]);

  const played = items.slice(0, index);
  const shown = playing?.item ?? played[played.length - 1] ?? null;
  const view: AudienceView | null = shown?.event.view ?? null;
  return { current: playing?.item ?? null, control: playing?.control ?? null, played, view, pending: items.length - index };
}
