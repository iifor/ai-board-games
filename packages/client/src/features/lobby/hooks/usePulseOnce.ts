import { useState } from 'react';

/**
 * active 从 false 变成 true 时给出一次 pulsing=true（初次就为 true 也算），动画播完由调用方 settle 清掉；
 * 用"把上一次的值存在 state 里"的方式在渲染期间比较，不用 effect
 */
export function usePulseOnce(active: boolean): { readonly pulsing: boolean; readonly settle: () => void } {
  const [pulsing, setPulsing] = useState(active);
  const [previous, setPrevious] = useState(active);
  if (previous !== active) {
    setPrevious(active);
    setPulsing(active);
  }
  return { pulsing, settle: () => setPulsing(false) };
}
