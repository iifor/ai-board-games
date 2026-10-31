/** 所有 REST 接口的统一响应：code 为 0 表示成功 */
export interface ApiSuccess<T> {
  readonly code: 0;
  readonly message: 'ok';
  readonly data: T;
}

export interface ApiFailure {
  readonly code: number;
  readonly message: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** 业务错误码：前三位对应 HTTP 状态 */
export const API_ERROR_CODES = {
  validation: 40001,
  unauthorized: 40101,
  passwordChangeRequired: 40301,
  forbidden: 40302,
  notFound: 40401,
  conflict: 40901,
  tooManyRequests: 42901,
  internal: 50000,
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.code === 0 && 'data' in response;
}
