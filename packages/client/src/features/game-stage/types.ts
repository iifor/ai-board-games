import type { AudioRef, GameResult, MatchStatus, StageEvent } from '@battle/shared';

export interface StreamItem {
  readonly event: StageEvent;
  readonly audio: AudioRef | null;
}

/**
 * 连接状态：connecting 正在连接或等待自动重连；open 已连上；
 * lost 自动重连已放弃，等用户手动重试；closed 播放流已结束，不再连接
 */
export type StreamConnection = 'connecting' | 'open' | 'lost' | 'closed';

export interface StreamState {
  readonly items: readonly StreamItem[];
  readonly status: MatchStatus | null;
  readonly ended: boolean;
  readonly result: GameResult | null;
  readonly error: string | null;
  readonly connection: StreamConnection;
}

export interface PlaybackOptions {
  readonly speed: number;
  readonly paused: boolean;
  readonly muted: boolean;
}

export const SPEEDS = [1, 1.5, 2, 3] as const;

/** 舞台快捷键对应的动作：空格 暂停 / 继续，← / → 倍速，M 静音，L 记录侧栏，R 终局结果（只在有结果时） */
export type StageShortcut = 'toggle-pause' | 'speed-down' | 'speed-up' | 'toggle-mute' | 'toggle-feed' | 'toggle-result';

/** 快捷键判定用到的焦点元素信息（HTMLElement 的子集，便于不依赖 DOM 测试） */
export interface ShortcutTargetLike {
  readonly tagName: string;
  readonly isContentEditable?: boolean | undefined;
}

/** 快捷键判定用到的键盘事件信息（KeyboardEvent 的子集） */
export interface ShortcutKeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  /** 事件目标（焦点所在元素）；焦点在页面本身时为 null */
  readonly target: ShortcutTargetLike | null;
}

/** 座位弹层里列出的一条公开发言 / 评委判定 */
export interface SeatSpeech {
  readonly seq: number;
  readonly kind: 'speech' | 'judgement';
  /** 轮次与阶段标题，如"第 1 轮 · 立论" */
  readonly title: string;
  readonly text: string;
}

/** 点击 / 回车座位卡片：座位号与卡片元素（弹层按它的包围盒定位，关闭后焦点还回它） */
export type SeatSelectHandler = (seat: number, element: HTMLElement) => void;

/** 已打开弹层的座位 */
export interface SeatSelection {
  readonly seat: number;
  readonly anchor: HTMLElement;
}
