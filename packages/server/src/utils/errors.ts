import { API_ERROR_CODES } from '@battle/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** 可安全返回给前端的业务错误；其余错误一律以通用 500 返回 */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string) => new AppError(400, API_ERROR_CODES.validation, message);
export const unauthorized = (message = '请先登录') => new AppError(401, API_ERROR_CODES.unauthorized, message);
export const forbidden = (message = '没有权限') => new AppError(403, API_ERROR_CODES.forbidden, message);
export const notFound = (what: string) => new AppError(404, API_ERROR_CODES.notFound, `${what}不存在`);
export const conflict = (message: string) => new AppError(409, API_ERROR_CODES.conflict, message);
export const tooManyRequests = (message: string) => new AppError(429, API_ERROR_CODES.tooManyRequests, message);
/** 上游服务（模型、语音）不可用或返回错误 */
export const upstream = (message: string) => new AppError(502, API_ERROR_CODES.upstream, message);

/** 日志字段用：任何抛出的值都给出一段可读信息 */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
