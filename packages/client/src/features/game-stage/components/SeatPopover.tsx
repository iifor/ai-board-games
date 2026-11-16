import type { AudienceSeat } from '@battle/shared';
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { POPOVER_GAP } from '../constants';
import { useSeatHover } from '../hooks/useSeatHover';
import type { SeatSpeech } from '../types';
import { popoverPlacement, type PopoverPlacement } from '../utils';
import { SeatProfile } from './SeatProfile';
import './SeatPopover.css';

interface SeatPopoverProps {
  readonly seat: AudienceSeat;
  /** 这个座位已播放的公开发言与判定（utils 的 speechesOfSeat） */
  readonly speeches: readonly SeatSpeech[];
  /** 资料卡按当前座位的包围盒定位，静态渲染时为 null。 */
  readonly anchor: HTMLElement | null;
  /** 弹层所在的舞台区域（.stage-arena），定位基准 */
  readonly arenaRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}

type PopoverStyle = CSSProperties & Record<'--popover-left' | '--popover-top' | '--popover-gap', string>;
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
 * 座位资料弹层：内容是 SeatProfile（头像、身份、阵营、存活状态与本局发言，可滚动）。
 * 挂在 .stage-arena 里、贴着座位卡片弹出（右侧放不下翻到左侧，上下夹回舞台内）；同一时间只有一个
 */
export function SeatPopover({ seat, speeches, anchor, arenaRef, onClose }: SeatPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const placement = usePlacement(ref, arenaRef, anchor, onCloseRef);
  useSeatHover(anchor, ref, onClose);
  const style: PopoverStyle | undefined = placement ? {
    '--popover-left': `${placement.left}px`, '--popover-top': `${placement.top}px`, '--popover-gap': `${POPOVER_GAP}px`,
  } : undefined;
  return (
    <div ref={ref} id="seat-profile" className="seat-popover glass-panel" role="region" aria-labelledby="seat-popover-name" data-team={seat.team ?? undefined} data-side={placement?.side ?? 'right'} style={style}>
      <SeatProfile seat={seat} speeches={speeches} nameId="seat-popover-name" />
    </div>
  );
}
