import type { AudienceView } from '@battle/shared';
import { useEffect, useRef, useState } from 'react';
import { describeEvent, displayDuration, shouldSpeak } from '../playback/describe';
import { playAudio, speak, wait } from '../playback/media';
import type { PlaybackOptions, StreamItem } from '../types';

async function present(item: StreamItem, options: PlaybackOptions, signal: AbortSignal): Promise<void> {
  const { text } = describeEvent(item.event);
  if (!options.muted && item.audio) return playAudio(item.audio.url, options.speed, signal);
  if (!options.muted && text && shouldSpeak(item.event)) return speak(text, options.speed, signal);
  return wait(displayDuration(text, options.speed), signal);
}

/**
 * 依次播放收到的事件：有音频播音频，否则浏览器朗读或按字数停留；
 * 每个事件播放完才 ack，服务端据此推进下一个。暂停时不再开始新的事件。
 */
export function usePlayback(items: readonly StreamItem[], ack: (seq: number) => void, options: PlaybackOptions) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState<StreamItem | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const controllerRef = useRef<AbortController | null>(null);

  // 只在卸载或换了一局时中止正在播放的事件；收到新事件不能打断当前播放
  const firstSeq = items[0]?.event.seq;
  useEffect(() => {
    setIndex(0);
    setPlaying(null);
    return () => controllerRef.current?.abort();
  }, [firstSeq]);

  useEffect(() => {
    const next = items[index];
    if (!next || playing || options.paused) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPlaying(next);
    void present(next, optionsRef.current, controller.signal).then(() => {
      if (controller.signal.aborted) return;
      ack(next.event.seq);
      setPlaying(null);
      setIndex((value) => value + 1);
    });
  }, [items, index, playing, options.paused, ack]);

  const played = items.slice(0, index);
  const shown = playing ?? played[played.length - 1] ?? null;
  const view: AudienceView | null = shown?.event.view ?? null;
  return { current: playing, played, view, pending: items.length - index };
}
