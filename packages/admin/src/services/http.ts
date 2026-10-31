import { API_ERROR_CODES, isApiSuccess, type ApiResponse } from '@battle/shared';
import { tokenStore } from './tokenStore';

export class ApiError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 登录失效或需要改密时通知应用外壳跳转 */
export const AUTH_EVENTS = { expired: 'admin:auth-expired', passwordRequired: 'admin:password-required' } as const;

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查服务是否启动');
  }
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!payload) throw new ApiError(response.status, `服务返回了无法识别的响应（${response.status}）`);
  if (isApiSuccess(payload)) return payload.data;
  if (payload.code === API_ERROR_CODES.unauthorized && token) {
    tokenStore.clear();
    window.dispatchEvent(new Event(AUTH_EVENTS.expired));
  }
  if (payload.code === API_ERROR_CODES.passwordChangeRequired) window.dispatchEvent(new Event(AUTH_EVENTS.passwordRequired));
  throw new ApiError(payload.code, payload.message);
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误';
}
