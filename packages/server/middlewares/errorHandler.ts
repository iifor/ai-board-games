import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from '../utils/errors';

function errorHandler(error: Error & { code?: string; httpStatus?: number; status?: number; statusCode?: number; issues?: Array<{ path: string[]; message: string }> }, _request: Request, response: Response, _next: NextFunction): void {
  console.error(error);

  if (error instanceof AppError) {
    response.status(error.httpStatus).json({
      code: error.code,
      message: error.message
    });
    return;
  }

  // Zod validation errors
  if (error.name === 'ZodError') {
    const messages = (error.issues || []).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    response.status(400).json({
      code: ErrorCodes.VALIDATION_ERROR,
      message: `参数校验失败：${messages}`
    });
    return;
  }

  // SQLite errors - don't leak details
  if (error.code && String(error.code).startsWith('SQLITE_')) {
    response.status(500).json({
      code: ErrorCodes.INTERNAL_ERROR,
      message: '服务器内部错误'
    });
    return;
  }

  // Generic fallback
  const status = error.httpStatus || error.status || error.statusCode || 500;
  const message = status === 500 ? '服务器内部错误' : error.message;
  response.status(status).json({
    code: error.code || ErrorCodes.INTERNAL_ERROR,
    message
  });
}

export { errorHandler };
