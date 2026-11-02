/**
 * 一段内容的播放进度：
 * - timed：按停留时长线性推进——从 fraction 起、startedAt 时刻开始、还剩 remainingMs 走完（朗读与纯停留都用这个口径）；
 * - measured：音频元素报告的实际进度。
 */
export type SegmentProgress =
  | { readonly kind: 'timed'; readonly fraction: number; readonly startedAt: number; readonly remainingMs: number }
  | { readonly kind: 'measured'; readonly fraction: number };

export interface SegmentState {
  readonly rate: number;
  readonly muted: boolean;
  readonly progress: SegmentProgress | null;
}

/**
 * 一段内容播放期间的实时控制：倍速与静音可以在播放中改变，媒体函数订阅后立即响应；
 * 同时承载进度，供字幕进度条订阅（状态对象每次变化整体替换，可直接给 useSyncExternalStore）。
 * 中止只在卸载页面或换局时发生。
 */
export class SegmentControl {
  #state: SegmentState;
  readonly #listeners = new Set<() => void>();
  readonly #controller = new AbortController();

  constructor(rate: number, muted: boolean) {
    this.#state = { rate, muted, progress: null };
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  get rate(): number {
    return this.#state.rate;
  }

  get muted(): boolean {
    return this.#state.muted;
  }

  get progress(): SegmentProgress | null {
    return this.#state.progress;
  }

  readonly getSnapshot = (): SegmentState => this.#state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  setRate(rate: number): void {
    if (rate !== this.#state.rate) this.#update({ rate });
  }

  /** 静音：正在播的音频 / 朗读立即停止，剩余部分改为按字数停留；取消静音只对下一段生效 */
  mute(): void {
    if (!this.#state.muted) this.#update({ muted: true });
  }

  setProgress(progress: SegmentProgress): void {
    this.#update({ progress });
  }

  abort(): void {
    this.#controller.abort();
  }

  #update(patch: Partial<SegmentState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** 某一时刻的进度比例（0–1） */
export function progressFraction(progress: SegmentProgress | null, now: number): number {
  if (!progress) return 0;
  if (progress.kind === 'measured') return clamp(progress.fraction);
  if (progress.remainingMs <= 0) return 1;
  const elapsed = Math.max(0, now - progress.startedAt);
  return clamp(progress.fraction + (1 - progress.fraction) * Math.min(1, elapsed / progress.remainingMs));
}
