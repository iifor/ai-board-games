import { afterEach, expect, it, vi } from 'vitest';
import { notifyTraceRemoved, onTraceRemoved } from './traceInvalidation';
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
