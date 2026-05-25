import * as crypto from 'crypto';

interface CacheResult<T> {
  value: T;
  cached: boolean;
}

const resultCache = new Map<string, unknown>();

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function cachedLlmCall<T>(
  cacheParts: string | unknown[],
  producer: () => Promise<T>
): Promise<CacheResult<T>> {
  const key = Array.isArray(cacheParts)
    ? hashText(cacheParts.map((item) => JSON.stringify(item)).join('\n'))
    : hashText(cacheParts);
  if (resultCache.has(key)) return { value: resultCache.get(key) as T, cached: true };
  const value = await producer();
  resultCache.set(key, value);
  return { value, cached: false };
}

export { cachedLlmCall, hashText };
