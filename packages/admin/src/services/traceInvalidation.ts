const EVENT = 'admin:trace-removed';
let tabChannel: BroadcastChannel | null = null;
let subscribers = 0;

/** 只广播失效的对局 ID；私密数据不进入浏览器持久存储。 */
export function notifyTraceRemoved(id: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: id }));
  if (tabChannel) {
    tabChannel.postMessage(id);
  } else if (typeof BroadcastChannel !== 'undefined') {
    const bus = new BroadcastChannel(EVENT);
    bus.postMessage(id);
    bus.close();
  }
}

export function onTraceRemoved(listener: (id: string) => void) {
  const local = (event: Event) => listener((event as CustomEvent<string>).detail);
  if (!tabChannel && typeof BroadcastChannel !== 'undefined') tabChannel = new BroadcastChannel(EVENT);
  const remote = (event: MessageEvent<unknown>) => { if (typeof event.data === 'string') listener(event.data); };
  const bus = tabChannel;
  bus?.addEventListener('message', remote);
  subscribers++;
  let active = true;
  window.addEventListener(EVENT, local);
  return () => {
    if (!active) return;
    active = false;
    window.removeEventListener(EVENT, local);
    bus?.removeEventListener('message', remote);
    if (--subscribers === 0) { tabChannel?.close(); tabChannel = null; }
  };
}

/** 回到页面时两次核实之间至少间隔这么久，避免来回切换标签页时反复拉取大体积数据 */
export const VIEW_RESUME_MIN_INTERVAL_MS = 30_000;

/**
 * 跨设备删除，或从浏览器前进/后退缓存恢复时，重新向服务端核实。
 * 标签页重新可见（visibilitychange）时节流：距上次核实（或订阅开始）不足 minIntervalMs 不刷新；
 * 从前进/后退缓存恢复的页面一定刷新。
 */
export function onAdminViewResumed(refresh: () => void, minIntervalMs = VIEW_RESUME_MIN_INTERVAL_MS) {
  let last = Date.now();
  const run = () => {
    last = Date.now();
    refresh();
  };
  const visible = () => {
    if (document.visibilityState === 'visible' && Date.now() - last >= minIntervalMs) run();
  };
  const restored = (event: PageTransitionEvent) => { if (event.persisted) run(); };
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('pageshow', restored);
  return () => { document.removeEventListener('visibilitychange', visible); window.removeEventListener('pageshow', restored); };
}
