const { AppError, ErrorCodes } = require('../utils/errors');

function errorHandler(error, request, response, next) {
  console.error(error);

  if (error instanceof AppError) {
    return response.status(error.httpStatus).json({
      code: error.code,
      message: error.message
    });
  }

  // Zod validation errors
  if (error.name === 'ZodError') {
    const messages = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return response.status(400).json({
      code: ErrorCodes.VALIDATION_ERROR,
      message: `参数校验失败：${messages}`
    });
  }

  // SQLite errors - don't leak details
  if (error.code && String(error.code).startsWith('SQLITE_')) {
    return response.status(500).json({
      code: ErrorCodes.INTERNAL_ERROR,
      message: '服务器内部错误'
    });
  }

  // Generic fallback
  const status = error.httpStatus || error.status || error.statusCode || 500;
  const message = status === 500 ? '服务器内部错误' : error.message;
  return response.status(status).json({
    code: error.code || ErrorCodes.INTERNAL_ERROR,
    message
  });
}

module.exports = { errorHandler };
