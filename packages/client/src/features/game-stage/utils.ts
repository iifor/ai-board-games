import { speechOf, type AudienceSeat, type AudienceView, type StageEvent } from '@battle/shared';
import { POPOVER_GAP, TEAM_LABELS } from './constants';
import { SPEEDS, type PlaybackOptions, type SeatSpeech, type ShortcutKeyLike, type StageShortcut, type StreamItem } from './types';

export type StagePeriod = 'day' | 'night';

/** 昼夜：优先用游戏在观众视图里给出的 period；没有时按阶段标题推断（只有狼人杀有夜晚） */
export function periodOf(view: AudienceView | null): StagePeriod {
  if (!view) return 'night';
  if (view.extra.period === 'day' || view.extra.period === 'night') return view.extra.period;
  if (view.gameKey !== 'werewolf') return 'day';
  return /夜|天黑/.test(view.phase?.title ?? '') ? 'night' : 'day';
}

export function seatOf(view: AudienceView | null, seat: number | null): AudienceSeat | null {
  return seat === null ? null : (view?.seats.find((candidate) => candidate.seat === seat) ?? null);
}

/** 夜晚闭眼：存活且没有在行动的座位；出局者保持出局样式，正在行动的座位亮着 */
export function isAsleep(seat: AudienceSeat, speaking: number | null, period: StagePeriod): boolean {
  return period === 'night' && seat.alive && seat.seat !== speaking;
}

export function roundLabel(view: AudienceView): string {
  return `第 ${view.round} ${view.gameKey === 'werewolf' ? '天' : '轮'}`;
}

export function teamLabel(team: string | null): string {
  return team === null ? '未知' : (TEAM_LABELS[team] ?? team);
}

export const KIND_LABELS: Readonly<Record<StageEvent['kind'], string>> = {
  phase_started: '阶段',
  narration: '主持播报',
  speech: '发言',
  action: '行动',
  vote_tallied: '计票',
  judgement: '评委点评',
  seat_eliminated: '出局',
  revealed: '揭示',
  fallback: '兜底',
  game_over: '终局',
};

/** 这些事件播放时把说话人的立绘放到舞台中央 */
/** 中央立绘聚光的事件：发言、点评、播报、揭示、终局，以及行动（开枪、自爆……当事座位站到中央，主持人声音读出） */
export function hasSpotlight(kind: StageEvent['kind']): boolean {
  return kind === 'speech' || kind === 'judgement' || kind === 'narration' || kind === 'revealed' || kind === 'game_over' || kind === 'action';
}

/** 本轮夜晚已经走过的阶段标题（含当前），只用公开的 phase_started 事件 */
export function nightStepsOf(played: readonly StreamItem[], current: StreamItem | null, view: AudienceView | null): readonly string[] {
  if (!view || periodOf(view) !== 'night') return [];
  const items = current ? [...played, current] : played;
  const steps: string[] = [];
  for (const { event } of items) {
    if (event.kind !== 'phase_started' || event.round !== view.round || periodOf(event.view) !== 'night') continue;
    if (steps[steps.length - 1] !== event.title) steps.push(event.title);
  }
  return steps;
}

/** 当前阶段里已经发言（或点评）的座位，含正在发言的 */
export function speechOrderOf(played: readonly StreamItem[], current: StreamItem | null, view: AudienceView | null): readonly number[] {
  if (!view?.phase) return [];
  const items = current ? [...played, current] : played;
  const seats: number[] = [];
  for (const { event } of items) {
    if (event.kind !== 'speech' && event.kind !== 'judgement') continue;
    if (event.round !== view.round || event.phaseId !== view.phase.id || seats.includes(event.seat)) continue;
    seats.push(event.seat);
  }
  return seats;
}

/** 评委已经给出的判定：座位 → 判定文字 */
export function judgeBadges(played: readonly StreamItem[]): Readonly<Record<number, readonly string[]>> {
  const badges: Record<number, string[]> = {};
  for (const { event } of played) if (event.kind === 'judgement') badges[event.seat] = [event.verdictLabel];
  return badges;
}

export interface TeamRoster {
  readonly team: string | null;
  readonly label: string;
  readonly seats: readonly AudienceSeat[];
}

/** 终局阵容：按阵营分组，保持座位顺序 */
export function rosterByTeam(view: AudienceView): readonly TeamRoster[] {
  const groups = new Map<string | null, AudienceSeat[]>();
  for (const seat of view.seats) {
    const list = groups.get(seat.team) ?? [];
    list.push(seat);
    groups.set(seat.team, list);
  }
  return [...groups.entries()].map(([team, seats]) => ({ team, label: teamLabel(team), seats }));
}

/** 某个座位在本局的公开发言与评委判定（已播放的，旧的在前），每条带轮次与阶段标题；判定文本与字幕同口径（"判定。点评"） */
export function speechesOfSeat(played: readonly StreamItem[], seat: number): readonly SeatSpeech[] {
  const speeches: SeatSpeech[] = [];
  for (const { event } of played) {
    if ((event.kind !== 'speech' && event.kind !== 'judgement') || event.seat !== seat) continue;
    const text = speechOf(event)?.text;
    if (text === undefined) continue;
    const phase = event.view.phase?.title;
    speeches.push({ seq: event.seq, kind: event.kind, title: phase ? `${roundLabel(event.view)} · ${phase}` : roundLabel(event.view), text });
  }
  return speeches;
}

/** 焦点在这些表单控件里时不响应快捷键 */
const EDITABLE_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * 键盘事件 → 舞台快捷键动作；不匹配为 null。
 * 按住 Ctrl / Meta / Alt、焦点在输入框 / 文本域 / 下拉框 / 可编辑区域时一律不响应；
 * 焦点在按钮上时空格交给按钮自己（原生激活，如座位卡片打开弹层），避免同一下既激活按钮又切换暂停。
 * Escape 不在这里：终局对话框与座位弹层各自处理
 */
export function shortcutActionOf(event: ShortcutKeyLike): StageShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const tag = event.target?.tagName.toUpperCase() ?? '';
  if (EDITABLE_TAGS.has(tag) || event.target?.isContentEditable) return null;
  switch (event.key) {
    case ' ':
      return tag === 'BUTTON' ? null : 'toggle-pause';
    case 'ArrowLeft':
      return 'speed-down';
    case 'ArrowRight':
      return 'speed-up';
    case 'm':
    case 'M':
      return 'toggle-mute';
    case 'l':
    case 'L':
      return 'toggle-feed';
    case 'r':
    case 'R':
      return 'toggle-result';
    default:
      return null;
  }
}

/** 相邻的倍速档（控制条提供的 1 / 1.5 / 2 / 3）；到头了保持不变，不在档位上的值取下一个更快 / 更慢的档 */
export function stepSpeed(speed: number, direction: -1 | 1): number {
  const steps = direction > 0 ? SPEEDS.filter((value) => value > speed) : [...SPEEDS].reverse().filter((value) => value < speed);
  return steps[0] ?? speed;
}

/** 快捷键作用于播放选项后的新选项；记录侧栏与终局结果不是播放选项，返回 null 由调用方处理 */
export function applyShortcut(action: StageShortcut, options: PlaybackOptions): PlaybackOptions | null {
  switch (action) {
    case 'toggle-pause':
      return { ...options, paused: !options.paused };
    case 'toggle-mute':
      return { ...options, muted: !options.muted };
    case 'speed-down':
      return { ...options, speed: stepSpeed(options.speed, -1) };
    case 'speed-up':
      return { ...options, speed: stepSpeed(options.speed, 1) };
    default:
      return null;
  }
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PopoverPlacement {
  /** 相对舞台区域左上角 */
  readonly left: number;
  readonly top: number;
  /** 弹层在卡片的哪一侧（决定弹出动画的原点） */
  readonly side: 'right' | 'left';
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * 座位弹层的位置：默认贴在卡片右侧、顶部对齐；右侧放不下翻到左侧；两侧都放不下时贴右侧并夹回舞台内。
 * 上下出界时夹回舞台内。包围盒都是视口坐标（getBoundingClientRect），结果相对舞台区域
 */
export function popoverPlacement(anchor: Box, arena: Box, size: { readonly width: number; readonly height: number }, gap = POPOVER_GAP): PopoverPlacement {
  const anchorLeft = anchor.left - arena.left;
  const anchorTop = anchor.top - arena.top;
  const maxLeft = Math.max(0, arena.width - size.width);
  const maxTop = Math.max(0, arena.height - size.height);
  const right = anchorLeft + anchor.width + gap;
  const left = anchorLeft - gap - size.width;
  const top = clamp(anchorTop, 0, maxTop);
  if (right <= maxLeft) return { left: right, top, side: 'right' };
  if (left >= 0) return { left, top, side: 'left' };
  return { left: clamp(right, 0, maxLeft), top, side: 'right' };
}
