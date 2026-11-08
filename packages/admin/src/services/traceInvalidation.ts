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

/** 跨设备删除，或从浏览器前进/后退缓存恢复时，重新向服务端核实。 */
export function onAdminViewResumed(refresh: () => void) {
  const restored = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', restored);
  return () => { window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', restored); };
}
