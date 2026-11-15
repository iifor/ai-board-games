type TokenField = 'max_tokens' | 'max_completion_tokens';

export interface ChatParameters {
  readonly tokenField: TokenField;
  readonly sendTemperature: boolean;
}

export function initialChatParameters(baseUrl: string): ChatParameters {
  return {
    tokenField: URL.canParse(baseUrl) && new URL(baseUrl).hostname === 'api.openai.com'
      ? 'max_completion_tokens' : 'max_tokens',
    sendTemperature: true,
  };
}

interface ParameterError {
  readonly code?: string;
  readonly param?: string;
  readonly message?: string;
}

/** 只接受上游明确指出的参数不兼容；不改变输出上限，也不放宽 JSON 要求。 */
export function adaptChatParameters(current: ChatParameters, error?: ParameterError): ChatParameters | undefined {
  const message = error?.message ?? '';
  if (current.tokenField === 'max_tokens' && (!error?.param || error.param === 'max_tokens')
    && /\bmax_tokens\b/i.test(message) && /use ['"`]?max_completion_tokens\b/i.test(message)) {
    return { ...current, tokenField: 'max_completion_tokens' };
  }
  if (current.sendTemperature && error?.param === 'temperature'
    && (error.code === 'unsupported_parameter' || (error.code === 'unsupported_value' && /default/i.test(message)))) {
    return { ...current, sendTemperature: false };
  }
  return undefined;
}
