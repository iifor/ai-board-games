const API_CODES = {
  SUCCESS: 0,
  NOT_FOUND: -100001,
  VALIDATION_ERROR: -100002,
  UPSTREAM_ERROR: -100003,
  INTERNAL_ERROR: -100004
} as const;

const SUCCESS_RESPONSE = { code: 0, message: '操作成功' } as const;

export { API_CODES, SUCCESS_RESPONSE };
