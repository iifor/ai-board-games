class AppError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const ErrorCodes = {
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN'
};

module.exports = { AppError, ErrorCodes };
