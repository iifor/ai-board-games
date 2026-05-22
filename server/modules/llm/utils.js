function getFetchFailureHint(error, endpoint) {
  const cause = error.cause;
  const code = cause?.code || cause?.name || '';
  const detail = cause?.message || error.message;

  if (code === 'ENOTFOUND') return `DNS 解析失败，无法找到接口域名。endpoint=${endpoint}`;
  if (code === 'ECONNREFUSED') return `连接被拒绝，请检查 baseUrl 是否正确。endpoint=${endpoint}`;
  if (code === 'ETIMEDOUT') return `连接超时，当前网络可能无法访问该 API。endpoint=${endpoint}`;
  if (code === 'ECONNRESET') return `连接被重置，可能是代理、中转或网络链路中断。endpoint=${endpoint}`;
  return `网络请求失败：${detail}。endpoint=${endpoint}`;
}

function resolveEnvTemplate(value, label = '配置') {
  return String(value || '').replace(/\$\{([A-Z0-9_]+)\}/gi, (match, name) => {
    const envValue = process.env[name];
    if (envValue === undefined || envValue === '') {
      throw new Error(`${label} 缺少环境变量 ${name}`);
    }
    return envValue;
  });
}

function normalizeBaseUrl(value, fallback, label = 'Base URL') {
  return resolveEnvTemplate(String(value || fallback).trim(), label);
}

function parseJsonObject(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

module.exports = { getFetchFailureHint, resolveEnvTemplate, normalizeBaseUrl, parseJsonObject };
