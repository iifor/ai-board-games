const { getFetchFailureHint, normalizeBaseUrl } = require('./utils');

async function callOpenAIChatRaw({
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  provider = 'openai',
  model,
  messages,
  temperature = 0.8,
  maxTokens = 800,
  apiFormat = 'openai-compatible'
}) {
  if (apiFormat === 'anthropic-compatible') {
    return callAnthropicChatRaw({ apiKey, baseUrl, provider, model, messages, temperature, maxTokens });
  }
  const endpoint = `${normalizeBaseUrl(baseUrl, 'https://api.openai.com/v1', 'Base URL').replace(/\/$/, '')}/chat/completions`;
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
  const message = data.choices?.[0]?.message || {};
  const content = String(message.content || '').trim();
  const thinking = String(message.reasoning_content || '').trim();
  return { content, thinking };
}

async function callOpenAIChat(options) {
  const { content } = await callOpenAIChatRaw(options);
  return content;
}

async function callAnthropicChatRaw({
  apiKey,
  baseUrl = 'https://api.anthropic.com/v1',
  provider = 'anthropic',
  model,
  messages,
  temperature = 0.8,
  maxTokens = 800
}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, 'https://api.anthropic.com/v1', 'Base URL').replace(/\/$/, '');
  const endpoint = `${normalizedBaseUrl.endsWith('/v1') ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`}/messages`;
  const systemMessages = (messages || []).filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  const conversation = (messages || [])
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.content || '')
    }));
  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        system: systemMessages || undefined,
        messages: conversation.length ? conversation : [{ role: 'user', content: 'ping' }],
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
  const content = (data.content || [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text || '')
    .join('')
    .trim();
  const thinking = (data.content || [])
    .filter((item) => item.type === 'thinking')
    .map((item) => item.thinking || '')
    .join('')
    .trim();
  return { content, thinking };
}

async function callAnthropicChat(options) {
  const { content } = await callAnthropicChatRaw(options);
  return content;
}

async function callModelChat(target) {
  if (target.apiFormat === 'anthropic-compatible') return callAnthropicChat(target);
  return callOpenAIChat(target);
}

async function callModelChatWithThinking(target) {
  if (target.apiFormat === 'anthropic-compatible') return callAnthropicChatRaw(target);
  return callOpenAIChatRaw(target);
}

async function testModelConnection(target) {
  const startedAt = Date.now();
  if (!target?.apiKey) {
    return {
      ok: false,
      provider: target?.provider || target?.name,
      model: target?.name || target?.model,
      apiFormat: target?.apiFormat || 'openai-compatible',
      message: '缺少 API Key，请先在 B 端模型管理中配置。'
    };
  }

  try {
    const reply = await callModelChat({
      ...target,
      model: target.model || target.name,
      messages: [{ role: 'user', content: '请只回复 pong' }],
      temperature: 0,
      maxTokens: 16
    });
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      provider: target.provider,
      model: target.model || target.name,
      apiFormat: target.apiFormat || 'openai-compatible',
      message: reply || '连接成功'
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      provider: target.provider,
      model: target.model || target.name,
      apiFormat: target.apiFormat || 'openai-compatible',
      message: error.message
    };
  }
}

async function testOpenAIConnection(target) {
  const endpoint = `${normalizeBaseUrl(target.baseUrl, 'https://api.openai.com/v1', 'Base URL').replace(/\/$/, '')}/models`;

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

module.exports = {
  callAnthropicChat,
  callAnthropicChatRaw,
  callModelChat,
  callModelChatWithThinking,
  callOpenAIChat,
  callOpenAIChatRaw,
  testModelConnection,
  testOpenAIConnection
};
