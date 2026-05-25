interface SuccessResponse {
  code: number;
  message: string;
  data: unknown;
}

interface ErrorResponse {
  code: string;
  message: string;
  httpStatus: number;
}

function formatSuccess(data: unknown, message = '操作成功'): SuccessResponse {
  return { code: 0, message, data };
}

function formatError(code: string, message: string, httpStatus = 400): ErrorResponse {
  return { code, message, httpStatus };
}

export { formatSuccess, formatError };
export type { SuccessResponse, ErrorResponse };
