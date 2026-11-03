import type { AudienceSeat } from '@battle/shared';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Avatar } from '../../../components/Avatar';
import { SEAT_TRIGGER_SELECTOR } from '../constants';
import type { SeatSpeech } from '../types';
import { KIND_LABELS, popoverPlacement, teamLabel, type PopoverPlacement } from '../utils';
import './SeatPopover.css';

interface SeatPopoverProps {
  readonly seat: AudienceSeat;
  /** 这个座位已播放的公开发言与判定（utils 的 speechesOfSeat） */
  readonly speeches: readonly SeatSpeech[];
  /** 打开弹层的座位卡片：位置按它的包围盒算出，关闭后焦点还回它；静态渲染时为 null */
  readonly anchor: HTMLElement | null;
  /** 弹层所在的舞台区域（.stage-arena），定位基准 */
  readonly arenaRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}

type PopoverStyle = CSSProperties & Partial<Record<'--popover-left' | '--popover-top', string>>;
type ElementRef = RefObject<HTMLElement | null>;
type CloseRef = RefObject<() => void>;

/** 位置：按卡片与舞台区域的包围盒算出；舞台变尺寸、座位滑动（transitionend）、弹层内容变高时重算；卡片不在了（换了一局）就关闭 */
function usePlacement(ref: ElementRef, arenaRef: ElementRef, anchor: HTMLElement | null, onCloseRef: CloseRef): PopoverPlacement | null {
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
  useLayoutEffect(() => {
    const popover = ref.current;
    const arena = arenaRef.current;
    if (!popover || !arena || !anchor) return;
    const update = () => {
      if (!anchor.isConnected) return onCloseRef.current();
      // offsetWidth / offsetHeight 是布局尺寸，不受弹出动画的 transform 影响
      const next = popoverPlacement(anchor.getBoundingClientRect(), arena.getBoundingClientRect(), { width: popover.offsetWidth, height: popover.offsetHeight });
      setPlacement((prev) => (prev && prev.left === next.left && prev.top === next.top && prev.side === next.side ? prev : next));
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(arena);
    observer?.observe(popover);
    arena.addEventListener('transitionend', update);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      arena.removeEventListener('transitionend', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, arenaRef, anchor, onCloseRef]);
  return placement;
}

/**
 * 关闭：Escape 在捕获阶段处理并截停，先于终局对话框（焦点在对话框里按 Escape 也只关弹层）；
 * 点在弹层外关闭，点在座位卡片上不算（卡片自己处理：同一座位关闭、其它座位切换）
 */
function useDismiss(ref: ElementRef, onCloseRef: CloseRef): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && (ref.current?.contains(target) || target.closest(SEAT_TRIGGER_SELECTOR))) return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [ref, onCloseRef]);
}

/** 打开时焦点移到弹层（读屏播报标题）；关闭时焦点还在弹层里才还回座位卡片（点了别处就留在别处） */
function useFocusReturn(ref: ElementRef, anchor: HTMLElement | null): void {
  useLayoutEffect(() => {
    const popover = ref.current;
    popover?.focus({ preventScroll: true });
    return () => {
      if (anchor?.isConnected && popover?.contains(document.activeElement)) anchor.focus({ preventScroll: true });
    };
  }, [ref, anchor]);
}

/**
 * 座位资料弹层：大头像、名字、座位、观众可见的身份 / 阵营、存活状态，以及这个座位本局的公开发言与判定（可滚动）。
 * 挂在 .stage-arena 里、贴着座位卡片弹出（右侧放不下翻到左侧，上下夹回舞台内）；同一时间只有一个
 */
export function SeatPopover({ seat, speeches, anchor, arenaRef, onClose }: SeatPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const placement = usePlacement(ref, arenaRef, anchor, onCloseRef);
  useDismiss(ref, onCloseRef);
  useFocusReturn(ref, anchor);
  const style: PopoverStyle | undefined = placement ? { '--popover-left': `${placement.left}px`, '--popover-top': `${placement.top}px` } : undefined;
  return (
    <div ref={ref} className="seat-popover glass-panel" role="dialog" aria-labelledby="seat-popover-name" tabIndex={-1} data-team={seat.team ?? undefined} data-side={placement?.side ?? 'right'} style={style}>
      <button type="button" className="seat-popover-close" aria-label="关闭座位资料" onClick={onClose}>×</button>
      <header className="seat-popover-head">
        <Avatar className="seat-popover-avatar" name={seat.name} avatar={seat.avatar} fallback={String(seat.seat)}>
          <b className="seat-popover-no">{seat.seat}</b>
        </Avatar>
        <div className="seat-popover-identity">
          <strong id="seat-popover-name">{seat.name}</strong>
          <span className="seat-popover-meta">
            <em className="ui-pill ui-pill-soft">{seat.seat} 号{seat.position === null ? '' : ` · ${seat.position}号位`}</em>
            <em className="ui-pill ui-pill-accent">{seat.roleName ?? '身份未知'}</em>
            {seat.team ? <em className="ui-pill seat-popover-team">{teamLabel(seat.team)}</em> : null}
            <em className={`ui-pill ${seat.alive ? 'ui-pill-outline' : 'seat-popover-out'}`}>{seat.alive ? '存活' : '出局'}</em>
          </span>
        </div>
      </header>
      <ol className="seat-popover-speeches" aria-label="本局发言">
        {speeches.map((speech) => (
          <li key={speech.seq} className={`seat-popover-${speech.kind}`}>
            <small>{speech.title} · {KIND_LABELS[speech.kind]}</small>
            <p>{speech.text}</p>
          </li>
        ))}
        {speeches.length === 0 ? <li className="seat-popover-empty">还没有公开发言</li> : null}
      </ol>
    </div>
  );
}
