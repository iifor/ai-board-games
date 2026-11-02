import { MAX_CONNECT_FAILURES, RECONNECT_BASE_MS, RECONNECT_MAX_MS } from '../constants';

/**
 * 第 failures 次连续失败后的重连等待：1 秒、2 秒、4 秒……封顶 15 秒；步长确定、不加抖动，便于推理与测试。
 * 达到失败上限返回 null：不再自动重连。
 */
export function reconnectDelay(failures: number): number | null {
  if (failures >= MAX_CONNECT_FAILURES) return null;
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, failures - 1));
}
