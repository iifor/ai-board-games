/**
 * 供应商明确表示额度耗尽、余额不足或欠费时返回的错误码（阿里百炼、火山方舟、OpenAI 等），统一按小写比较。
 * 普通限流（429 且没有这些错误码）仍视为瞬时故障，可重试，不会停用模型。
 */
export const QUOTA_EXHAUSTED_CODES: ReadonlySet<string> = new Set([
  'arrearage',
  'allocationquota.freetieronly',
  'prepaidbilloverdue',
  'postpaidbilloverdue',
  'accountoverdue',
  'insufficient_quota',
  'insufficient_user_quota',
]);

function errorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { code?: unknown; error?: { code?: unknown } | null };
  const code = record.error && typeof record.error === 'object' ? record.error.code : record.code;
  return typeof code === 'string' ? code.trim().toLowerCase() : null;
}

/** 4xx 且错误码在额度耗尽列表中 */
export function isQuotaExhausted(status: number, payload: unknown): boolean {
  if (status < 400 || status >= 500) return false;
  const code = errorCode(payload);
  return code !== null && QUOTA_EXHAUSTED_CODES.has(code);
}
