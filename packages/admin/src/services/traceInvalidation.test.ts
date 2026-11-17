import { afterEach, expect, it, vi } from 'vitest';
import { notifyTraceRemoved, onAdminViewResumed, onTraceRemoved } from './traceInvalidation';
import { deleteTrace } from './traces';
import { http } from './http';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('invalidates local and other same-origin views only after the server confirms deletion', async () => {
  vi.stubGlobal('window', new EventTarget());
  const local = vi.fn();
  const unsubscribe = onTraceRemoved(local);
  const otherTab = new BroadcastChannel('admin:trace-removed');
  try {
    const remove = vi.spyOn(http, 'del').mockRejectedValueOnce(new Error('数据库不可用')).mockResolvedValue(null);
    await expect(deleteTrace('m_test')).rejects.toThrow('数据库不可用');
    expect(local).not.toHaveBeenCalled();
    const received = new Promise<string>((resolve) => { otherTab.onmessage = (event) => resolve(String(event.data)); });
    await deleteTrace('m_test');
    expect(await received).toBe('m_test');
    expect(local).toHaveBeenCalledWith('m_test');
    expect(remove).toHaveBeenCalledWith('/api/admin/traces/m_test');
    const remote = new Promise<string>((resolve) => local.mockImplementationOnce(resolve));
    otherTab.postMessage('m_from_other_tab');
    expect(await remote).toBe('m_from_other_tab');
    unsubscribe();
    local.mockClear();
    notifyTraceRemoved('m_after_unmount');
    expect(local).not.toHaveBeenCalled();
  } finally { unsubscribe(); otherTab.close(); }
});

it('re-verifies on tab return at most once per interval, and always after a back/forward cache restore', async () => {
  vi.useFakeTimers();
  try {
    const page = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
    const win = new EventTarget();
    vi.stubGlobal('document', page);
    vi.stubGlobal('window', win);
    const refresh = vi.fn();
    const show = (state: 'visible' | 'hidden') => { page.visibilityState = state; page.dispatchEvent(new Event('visibilitychange')); };
    const unsubscribe = onAdminViewResumed(refresh, 30_000);

    win.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(10_000);
    show('visible');
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(25_000);
    show('hidden');
    expect(refresh).not.toHaveBeenCalled();
    show('visible');
    expect(refresh).toHaveBeenCalledTimes(1);
    show('hidden');
    show('visible');
    expect(refresh).toHaveBeenCalledTimes(1);

    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(refresh).toHaveBeenCalledTimes(2);
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(refresh).toHaveBeenCalledTimes(2);

    unsubscribe();
    vi.advanceTimersByTime(60_000);
    show('visible');
    expect(refresh).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});
