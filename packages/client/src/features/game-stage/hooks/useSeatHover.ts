import { useEffect, type RefObject } from 'react';

/** 座位和资料卡构成同一个悬浮区，短暂的离开延时允许指针跨过两者之间的间隙。 */
export function useSeatHover(anchor: HTMLElement | null, panelRef: RefObject<HTMLElement | null>, onClose: () => void, leaveDelay = 180): void {
  useEffect(() => {
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    let timer: number | undefined;
    const cancel = () => window.clearTimeout(timer);
    const leave = () => {
      cancel();
      timer = window.setTimeout(() => {
        if (panel.matches(':hover') || anchor.matches(':hover, :focus-visible') || panel.contains(document.activeElement)) return;
        onClose();
      }, leaveDelay);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' && document.activeElement === anchor) {
        event.preventDefault();
          panel.querySelector<HTMLElement>('.seat-popover-details')?.focus({ preventScroll: true });
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (panel.contains(document.activeElement)) anchor.focus({ preventScroll: true });
        onClose();
      }
    };
    for (const element of [anchor, panel]) {
      element.addEventListener('pointerenter', cancel);
      element.addEventListener('pointerleave', leave);
      element.addEventListener('focusin', cancel);
      element.addEventListener('focusout', leave);
    }
    document.addEventListener('keydown', keyDown, true);
    leave();
    return () => {
      cancel();
      document.removeEventListener('keydown', keyDown, true);
      for (const element of [anchor, panel]) {
        element.removeEventListener('pointerenter', cancel);
        element.removeEventListener('pointerleave', leave);
        element.removeEventListener('focusin', cancel);
        element.removeEventListener('focusout', leave);
      }
    };
  }, [anchor, panelRef, onClose, leaveDelay]);
}
