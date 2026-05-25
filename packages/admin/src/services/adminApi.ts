import type { AdminRequestOptions } from '../types/api';
import { AdminApiError } from '../types/api';

export async function adminRequest<T = unknown>(
  path: string,
  options: AdminRequestOptions = {}
): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    },
    body: options.body
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new AdminApiError(
      (data?.message as string) || '后台请求失败',
      data?.template,
      data
    );
  }
  return (data?.code === 0 && Object.prototype.hasOwnProperty.call(data, 'data')
    ? data.data
    : data) as T;
}
