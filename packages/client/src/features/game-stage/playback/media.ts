import { isSheriffChoice, speechOf, stripSpeechTags } from '@battle/shared';
import type { StreamItem } from '../types';
import { describeEvent, displayDuration, voteBoardDuration } from './describe';
import type { SegmentControl } from './segment';
import { skillCue } from '../animation/skillCue';
import { holdSkill, skillDuration } from '../animation/skillTiming';
import { AUDIO_STALL_MS, SPEECH_WATCHDOG_FACTOR, SPEECH_WATCHDOG_GRACE_MS } from '../constants';

const now = () => Date.now();

/** 正在朗读的对象；只为保持引用，防止被回收 */
const speaking = new Set<SpeechSynthesisUtterance>();

/**
 * 按字数停留（没有音频 / 静音时的展示时长）；倍速改变时按已走过的比例重排剩余时间。
 * fromFraction：从这个比例开始停留——音频或朗读中途静音时，接着走完剩余部分。
 */
export function dwell(control: SegmentControl, text: string | null, fromFraction = 0): Promise<void> {
  return dwellForDuration(control, displayDuration(text, 1), fromFraction);
}

function dwellForDuration(control: SegmentControl, durationMs: number, fromFraction = 0): Promise<void> {
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
      remaining = Math.round(durationMs * (1 - fraction) / control.rate);
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
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const fraction = () =>
      Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(1, audio.currentTime / audio.duration) : estimatedFraction(startedAt, text, control.rate);
    const stop = () => {
      settled = true;
      if (stallTimer !== null) clearTimeout(stallTimer);
      unsubscribe();
      audio.pause();
    };
    /** 每次有播放进度就重新计时；长时间没有进度（缓冲卡死、ended 没触发）就按剩余比例停留 */
    const watchStall = () => {
      if (stallTimer !== null) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => fallback(fraction()), AUDIO_STALL_MS);
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
      if (settled) return;
      control.setProgress({ kind: 'measured', fraction: fraction(), positionMs: audio.currentTime * 1000 });
      watchStall();
    });
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', () => fallback(0), { once: true });
    control.signal.addEventListener('abort', finish, { once: true });
    // 第一次 timeupdate 之前先给个 0%，进度条立刻出现而不是空一拍
    control.setProgress({ kind: 'measured', fraction: 0, positionMs: 0 });
    watchStall();
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
  text = stripSpeechTags(text);
  if (!text.trim()) return Promise.resolve();
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return dwell(control, text);
  return new Promise((resolve) => {
    const rate = control.rate;
    const startedAt = now();
    let settled = false;
    const utterance = new SpeechSynthesisUtterance(text);
    // Chrome 会回收没有 JS 引用的朗读对象，之后 onend 永远不来；朗读期间一直持有它
    speaking.add(utterance);
    const watchdog = setTimeout(() => {
      window.speechSynthesis.cancel();
      finish();
    }, displayDuration(text, rate) * SPEECH_WATCHDOG_FACTOR + SPEECH_WATCHDOG_GRACE_MS);
    const stop = () => {
      settled = true;
      clearTimeout(watchdog);
      speaking.delete(utterance);
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
  // 旧回放可能已缓存这段语音，仍以当前展示规则为准，短暂停留供座位动效播放。
  if (isSheriffChoice(item.event)) return dwell(control, null);
  const cue = skillCue(item.event);
  return Promise.all([presentMedia(item, control), cue ? holdSkill(skillDuration(cue), control) : Promise.resolve()]).then(() => undefined);
}

function presentMedia(item: StreamItem, control: SegmentControl): Promise<void> {
  const { text } = describeEvent(item.event);
  if (item.event.kind === 'vote_tallied' && text === null) return dwellForDuration(control, voteBoardDuration(item.event));
  if (item.event.kind === 'action' && item.event.phaseId === 'speech_direction' && text === null) return dwell(control, null);
  const speech = control.muted ? null : speechOf(item.event);
  if (speech && item.audio) return playAudio(item.audio.url, control, text);
  if (speech) return speak(speech.text, control);
  return dwell(control, text);
}
