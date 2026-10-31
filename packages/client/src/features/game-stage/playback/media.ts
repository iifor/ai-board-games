/** 播放音频直到结束；被中止或出错时立即结束，不抛错（播放失败不应卡住对局） */
export function playAudio(url: string, rate: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.playbackRate = rate;
    const done = () => {
      audio.pause();
      resolve();
    };
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', done, { once: true });
    signal.addEventListener('abort', done, { once: true });
    audio.play().catch(done);
  });
}

/** 浏览器朗读；不支持时直接结束 */
export function speak(text: string, rate: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    signal.addEventListener('abort', () => {
      window.speechSynthesis.cancel();
      resolve();
    }, { once: true });
    window.speechSynthesis.speak(utterance);
  });
}

export function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
