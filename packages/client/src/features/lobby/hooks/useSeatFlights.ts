import { useCallback, useMemo, useRef } from 'react';
import { fadeOut, flyTo } from '../animations';

/** 多人同时起飞 / 离席时相邻两人的错峰间隔（ms） */
export const FLIGHT_STAGGER = 70;
export const FADE_STAGGER = 30;

export interface SeatFlights {
  /** 选人卡片上的头像：飞行的起点 */
  readonly registerSource: (playerId: number, element: HTMLElement | null) => void;
  /** 座位槽：飞行的终点 */
  readonly registerSlot: (seatIndex: number, element: HTMLElement | null) => void;
  /** 玩家按顺序飞入从 startIndex 起的座位；在更新选中状态之前调用（此时座位槽还是空的、可以量尺寸） */
  readonly arrive: (playerIds: readonly number[], startIndex: number) => void;
  /** 座位上的玩家离席：座位卡片原地淡出；在更新选中状态之前调用 */
  readonly leave: (seats: readonly { readonly playerId: number; readonly seatIndex: number }[]) => void;
  /** 该玩家的座位卡片应当延迟多久再弹出（等克隆体落地），单位 ms；没有在飞的为 0 */
  readonly arrivalDelay: (playerId: number) => number;
}

/**
 * 选人 → 座位的飞行动效：登记起点（选人头像）与终点（座位槽）元素，
 * 起飞时记录每位玩家的落地时刻，座位卡片渲染时据此把弹出动画延后到落地之后。
 * 落地时刻只存在 ref 里：它在触发状态更新的同一个事件里写入，之后的渲染读取；过期的记录自然算出 0
 */
export function useSeatFlights(): SeatFlights {
  const sources = useRef(new Map<number, HTMLElement>());
  const slots = useRef(new Map<number, HTMLElement>());
  const landings = useRef(new Map<number, number>());

  const registerSource = useCallback((playerId: number, element: HTMLElement | null) => {
    if (element) sources.current.set(playerId, element);
    else sources.current.delete(playerId);
  }, []);

  const registerSlot = useCallback((seatIndex: number, element: HTMLElement | null) => {
    if (element) slots.current.set(seatIndex, element);
    else slots.current.delete(seatIndex);
  }, []);

  const arrive = useCallback((playerIds: readonly number[], startIndex: number) => {
    const now = performance.now();
    playerIds.forEach((playerId, offset) => {
      const from = sources.current.get(playerId);
      const slot = slots.current.get(startIndex + offset);
      // 落点是空位上的号码圆（尺寸、位置都和就座后的头像一致），没有就退到整个槽
      const to = slot?.firstElementChild instanceof HTMLElement ? slot.firstElementChild : slot;
      const landing = from && to ? flyTo(from, to, { delay: offset * FLIGHT_STAGGER }) : 0;
      landings.current.set(playerId, now + landing);
    });
  }, []);

  const leave = useCallback((seats: readonly { readonly playerId: number; readonly seatIndex: number }[]) => {
    seats.forEach(({ playerId, seatIndex }, offset) => {
      landings.current.delete(playerId);
      const slot = slots.current.get(seatIndex);
      const card = slot?.firstElementChild;
      if (card instanceof HTMLElement) fadeOut(card, { delay: offset * FADE_STAGGER });
    });
  }, []);

  const arrivalDelay = useCallback((playerId: number) => {
    const landing = landings.current.get(playerId);
    return landing === undefined ? 0 : Math.max(0, Math.round(landing - performance.now()));
  }, []);

  return useMemo(() => ({ registerSource, registerSlot, arrive, leave, arrivalDelay }), [registerSource, registerSlot, arrive, leave, arrivalDelay]);
}
