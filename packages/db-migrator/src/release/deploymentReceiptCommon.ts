import path from 'node:path';

export const GIT_SHA = /^[a-f0-9]{40}$/;
export const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;
export const SHA256 = /^[a-f0-9]{64}$/;

export interface ReceiptArtifact {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function canonicalUtc(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function meaningful(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
    && !value.trim().startsWith('REPLACE_WITH_') && !/^<.*>$/.test(value.trim());
}

export function validGitSha(value: unknown): value is string {
  return typeof value === 'string' && GIT_SHA.test(value) && !/^0{40}$/.test(value);
}

export function normalizedRelativePath(value: unknown): value is string {
  return meaningful(value)
    && !String(value).includes('\\')
    && !/[\u0000-\u001f*?[\]]/.test(String(value))
    && !path.posix.isAbsolute(String(value))
    && path.posix.normalize(String(value)) === value
    && value !== '.' && value !== '..'
    && !String(value).startsWith('../');
}

export function isReceiptArtifact(value: unknown): value is ReceiptArtifact {
  if (!exactKeys(value, ['path', 'sizeBytes', 'sha256'])) return false;
  return normalizedRelativePath(value.path)
    && Number.isSafeInteger(value.sizeBytes)
    && Number(value.sizeBytes) >= 0
    && typeof value.sha256 === 'string'
    && SHA256.test(value.sha256);
}

export function fixedReceiptError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
