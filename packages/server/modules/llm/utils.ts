function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getFetchFailureHint(error: unknown, endpoint: string): string {
  const err = error as { cause?: { code?: string; name?: string; message?: string }; message?: string };
  const cause = err.cause;
  const code = cause?.code || cause?.name || '';
  const detail = cause?.message || err.message || '';

  if (code === 'ENOTFOUND') return `DNS 解析失败，无法找到接口域名。endpoint=${endpoint}`;
  if (code === 'ECONNREFUSED') return `连接被拒绝，请检查 baseUrl 是否正确。endpoint=${endpoint}`;
  if (code === 'ETIMEDOUT') return `连接超时，当前网络可能无法访问该 API。endpoint=${endpoint}`;
  if (code === 'UND_ERR_CONNECT_TIMEOUT') return `连接超时，后端无法在限时内连接到供应商 API。endpoint=${endpoint}`;
  if (code === 'ECONNRESET') return `连接被重置，可能是代理、中转或网络链路中断。endpoint=${endpoint}`;
  return `网络请求失败：${detail}。endpoint=${endpoint}`;
}

function resolveEnvTemplate(value: string, label = '配置'): string {
  return String(value || '').replace(/\$\{([A-Z0-9_]+)\}/gi, (_match: string, name: string) => {
    const envValue = process.env[name];
    if (envValue === undefined || envValue === '') {
      throw new Error(`${label} 缺少环境变量 ${name}`);
    }
    return envValue;
  });
}

function normalizeBaseUrl(value: string | undefined | null, fallback: string, label = 'Base URL'): string {
  return resolveEnvTemplate(String(value || fallback).trim(), label);
}

function parseJsonObject(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export { getFetchFailureHint, resolveEnvTemplate, normalizeBaseUrl, parseJsonObject, parseJson };
