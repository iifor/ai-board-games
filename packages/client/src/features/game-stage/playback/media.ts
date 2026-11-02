import { displayDuration } from './describe';

export function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * 播放音频直到结束；被中止时立即结束。
 * 播放失败（最常见是刷新 / 书签进入对局时浏览器拦截自动播放）不能当作"播放完成"，
 * 否则每个事件 0 毫秒就 ack，整局会被秒放；改为按字数停留 fallbackMs。
 */
export function playAudio(url: string, rate: number, signal: AbortSignal, fallbackMs: number): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.playbackRate = rate;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      audio.pause();
      resolve();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      audio.pause();
      void wait(fallbackMs, signal).then(resolve);
    };
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', fail, { once: true });
    signal.addEventListener('abort', finish, { once: true });
    audio.play().catch(fail);
  });
}

/** 浏览器朗读；不支持或朗读失败时按字数停留，而不是直接结束 */
export function speak(text: string, rate: number, signal: AbortSignal): Promise<void> {
  const fallbackMs = displayDuration(text, rate);
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return wait(fallbackMs, signal);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    utterance.onend = finish;
    utterance.onerror = () => {
      if (settled) return;
      settled = true;
      void wait(fallbackMs, signal).then(resolve);
    };
    signal.addEventListener('abort', () => {
      window.speechSynthesis.cancel();
      finish();
    }, { once: true });
    window.speechSynthesis.speak(utterance);
  });
}
