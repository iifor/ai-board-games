import { speechOf } from '@battle/shared';
import type { StreamItem } from '../types';
import { describeEvent, displayDuration } from './describe';
import type { SegmentControl } from './segment';

const now = () => Date.now();

/**
 * 按字数停留（没有音频 / 静音时的展示时长）；倍速改变时按已走过的比例重排剩余时间。
 * fromFraction：从这个比例开始停留——音频或朗读中途静音时，接着走完剩余部分。
 */
export function dwell(control: SegmentControl, text: string | null, fromFraction = 0): Promise<void> {
  if (control.signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let fraction = Math.min(1, Math.max(0, fromFraction));
    let rate = control.rate;
    let startedAt = now();
    let remaining = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const arm = () => {
      remaining = Math.round(displayDuration(text, control.rate) * (1 - fraction));
      startedAt = now();
      control.setProgress({ kind: 'timed', fraction, startedAt, remainingMs: remaining });
      timer = setTimeout(finish, remaining);
    };
    const unsubscribe = control.subscribe(() => {
      if (control.rate === rate) return;
      rate = control.rate;
      if (timer !== null) clearTimeout(timer);
      fraction = remaining > 0 ? Math.min(1, fraction + (1 - fraction) * ((now() - startedAt) / remaining)) : 1;
      arm();
    });
    control.signal.addEventListener('abort', finish, { once: true });
    arm();
  });
}

/** 按时间估算的进度（音频拿不到 duration、或朗读时用） */
function estimatedFraction(startedAt: number, text: string | null, rate: number): number {
  return Math.min(1, (now() - startedAt) / displayDuration(text, rate));
}

/**
 * 播放服务端音频直到结束；倍速实时作用于 playbackRate，进度来自 timeupdate。
 * 播放失败（最常见是刷新 / 书签进入对局时浏览器拦截自动播放）不能当作"播放完成"，
 * 否则每个事件 0 毫秒就 ack，整局会被秒放；改为按字数停留。
 * 中途静音：停下音频，剩余部分按字数停留。
 */
export function playAudio(url: string, control: SegmentControl, text: string | null): Promise<void> {
  if (control.signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.playbackRate = control.rate;
    const startedAt = now();
    let settled = false;
    const fraction = () =>
      Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(1, audio.currentTime / audio.duration) : estimatedFraction(startedAt, text, control.rate);
    const stop = () => {
      settled = true;
      unsubscribe();
      audio.pause();
    };
    const finish = () => {
      if (settled) return;
      stop();
      resolve();
    };
    const fallback = (from: number) => {
      if (settled) return;
      stop();
      void dwell(control, text, from).then(resolve);
    };
    const unsubscribe = control.subscribe(() => {
      if (control.muted) fallback(fraction());
      else audio.playbackRate = control.rate;
    });
    audio.addEventListener('timeupdate', () => {
      if (!settled) control.setProgress({ kind: 'measured', fraction: fraction() });
    });
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', () => fallback(0), { once: true });
    control.signal.addEventListener('abort', finish, { once: true });
    // 第一次 timeupdate 之前先给个 0%，进度条立刻出现而不是空一拍
    control.setProgress({ kind: 'measured', fraction: 0 });
    audio.play().catch(() => fallback(0));
  });
}

/**
 * 浏览器朗读；不支持或朗读失败时按字数停留。进度按停留时长估算（与停留计时器同一口径）。
 * 朗读语速只能在开始前设定（utterance.rate 在朗读中改动无效），所以倍速改变要到下一段才生效；
 * 中途静音：取消朗读，剩余部分按字数停留。
 */
export function speak(text: string, control: SegmentControl): Promise<void> {
  if (control.signal.aborted) return Promise.resolve();
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return dwell(control, text);
  return new Promise((resolve) => {
    const rate = control.rate;
    const startedAt = now();
    let settled = false;
    const stop = () => {
      settled = true;
      unsubscribe();
    };
    const finish = () => {
      if (settled) return;
      stop();
      resolve();
    };
    const fallback = () => {
      if (settled) return;
      stop();
      window.speechSynthesis.cancel();
      void dwell(control, text, estimatedFraction(startedAt, text, rate)).then(resolve);
    };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    utterance.onend = finish;
    utterance.onerror = fallback;
    const unsubscribe = control.subscribe(() => {
      if (control.muted) fallback();
    });
    control.signal.addEventListener('abort', () => {
      window.speechSynthesis.cancel();
      finish();
    }, { once: true });
    control.setProgress({ kind: 'timed', fraction: 0, startedAt, remainingMs: displayDuration(text, rate) });
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * 一段内容怎么播：有服务端音频播音频；否则要朗读的事件（speechOf 决定，行动由主持人声音读）用浏览器朗读；
 * 其余按字数停留。静音时全部按字数停留。
 */
export function present(item: StreamItem, control: SegmentControl): Promise<void> {
  const { text } = describeEvent(item.event);
  if (!control.muted && item.audio) return playAudio(item.audio.url, control, text);
  const speech = control.muted ? null : speechOf(item.event);
  if (speech) return speak(speech.text, control);
  return dwell(control, text);
}
