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

async function callOpenAIChat({
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  provider = 'openai',
  model,
  messages,
  temperature = 0.8,
  maxTokens = 260
}) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      })
    });
  } catch (error) {
    throw new Error(`[${provider}:${model}] ${getFetchFailureHint(error, endpoint)}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[${provider}:${model}] ${response.status} ${endpoint}: ${body}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function testOpenAIConnection(target) {
  const endpoint = `${target.baseUrl.replace(/\/$/, '')}/models`;

  if (!target.apiKey) {
    return {
      ok: false,
      endpoint,
      provider: target.provider || target.name,
      baseUrl: target.baseUrl,
      apiKeyEnv: target.apiKeyEnv,
      message: `缺少 API Key，请在 .env 中配置 ${target.apiKeyEnv}`
    };
  }

  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${target.apiKey}` }
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      endpoint,
      provider: target.provider || target.name,
      baseUrl: target.baseUrl,
      apiKeyEnv: target.apiKeyEnv,
      message: response.ok ? 'OpenAI compatible endpoint reachable' : body.slice(0, 500)
    };
  } catch (error) {
    return {
      ok: false,
      endpoint,
      provider: target.provider || target.name,
      baseUrl: target.baseUrl,
      apiKeyEnv: target.apiKeyEnv,
      message: getFetchFailureHint(error, endpoint)
    };
  }
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

module.exports = {
  callOpenAIChat,
  parseJsonObject,
  testOpenAIConnection
};
