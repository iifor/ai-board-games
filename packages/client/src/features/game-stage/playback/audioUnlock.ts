/**
 * 浏览器自动播放拦截与解锁。
 * 直接打开对局链接、iOS Safari 等情况下 audio.play() 会以 NotAllowedError 拒绝；播放层照常按字数停留推进，
 * 同时在这里记下"被拦截"，舞台据此提示"点击开启声音"。用户点击时在同一个手势里播一段静音，
 * 解锁一个可复用的音频元素（iOS 按元素放行），之后每段服务端音频都换 src 用它播放。
 */

/** 80 个采样的静音 WAV，只用于在用户手势里"播一下"解锁音频元素 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

let shared: HTMLAudioElement | null = null;
let unlocked = false;
let blocked = false;
const listeners = new Set<() => void>();

function setBlocked(next: boolean): void {
  if (blocked === next) return;
  blocked = next;
  for (const listener of listeners) listener();
}

/** play() / 朗读的失败是否是浏览器的自动播放拦截 */
export function isAutoplayBlockedError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotAllowedError';
}

/** 播放层发现声音被拦截时调用；舞台订阅后显示开启声音的提示 */
export function reportAutoplayBlocked(): void {
  setBlocked(true);
}

export function isAutoplayBlocked(): boolean {
  return blocked;
}

export function subscribeAutoplayBlocked(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 一段服务端音频用哪个元素播：解锁后复用同一个元素，否则每段新建 */
export function audioElementFor(url: string): HTMLAudioElement {
  if (unlocked && shared) {
    shared.src = url;
    return shared;
  }
  return new Audio(url);
}

/**
 * 必须在用户手势（点击）的同步调用栈里调用：播放静音解锁可复用的音频元素，顺带唤醒浏览器朗读。
 * 成功后清除"被拦截"；失败时提示保留、错误交给调用方。
 */
export function unlockAudio(): Promise<void> {
  const element = shared ?? new Audio();
  shared = element;
  element.src = SILENT_WAV;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  }
  return element.play().then(() => {
    unlocked = true;
    setBlocked(false);
  });
}

/** 仅供测试：回到初始状态 */
export function resetAudioUnlockForTest(): void {
  shared = null;
  unlocked = false;
  blocked = false;
  listeners.clear();
}
