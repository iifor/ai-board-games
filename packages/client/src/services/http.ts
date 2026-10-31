import { isApiSuccess, type ApiResponse } from '@battle/shared';

/** 接口返回的业务错误：message 可直接展示给用户 */
export class ApiError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查服务是否启动');
  }
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!payload) throw new ApiError(response.status, `服务返回了无法识别的响应（${response.status}）`);
  if (!isApiSuccess(payload)) throw new ApiError(payload.code, payload.message);
  return payload.data;
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误';
}
