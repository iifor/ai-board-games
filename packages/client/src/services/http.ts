import { isApiSuccess, type ApiResponse } from '@battle/shared';

/** 接口返回的业务错误：message 可直接展示给用户 */
export class ApiError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** token 为身份码换来的开局凭证，只有开局相关接口需要 */
async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<T> {
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
  if (!payload) {
    const unavailable = [502, 503, 504].includes(response.status);
    throw new ApiError(response.status, unavailable ? '暂时连不上游戏服务，请稍后重试。' : `加载失败（HTTP ${response.status}），请重试。`);
  }
  if (!isApiSuccess(payload)) throw new ApiError(payload.code, payload.message);
  return payload.data;
}

export const http = {
  get: <T>(path: string, token?: string) => request<T>('GET', path, undefined, token),
  post: <T>(path: string, body: unknown, token?: string) => request<T>('POST', path, body, token),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误';
}
