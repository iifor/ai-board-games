import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab 在对话框内循环：从 current（-1 表示焦点不在任一项上）出发，向前或向后的下一个下标 */
export function nextFocusIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? -1 : 1) + count) % count;
}

/**
 * 对话框焦点管理：打开时把焦点移进去（第一个可聚焦元素，否则容器本身，容器需 tabIndex=-1），
 * Tab 在内部循环，Escape 触发 onClose，关闭（卸载）时焦点回到打开前的元素。
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose?: (() => void) | undefined): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (focusables()[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!onCloseRef.current) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const target = items[nextFocusIndex(items.length, items.findIndex((item) => item === document.activeElement), event.shiftKey)];
      if (!target) return;
      event.preventDefault();
      target.focus();
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [ref]);
}
