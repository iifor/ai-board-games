import { afterEach, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleClient } from '../src/modules/llm/client';
import type { LlmRequest } from '../src/modules/llm/types';

const request: LlmRequest = {
  baseUrl: 'https://api.openai.com/v1/', apiKey: 'test', model: 'chat-model',
  messages: [{ role: 'user', content: 'Return JSON' }], temperature: 0.7, maxTokens: 123, timeoutMs: 5000,
};
const success = () => Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
const rejected = (param: string, code: string, message: string) => Response.json({ error: { param, code, message } }, { status: 400 });
function setup(...responses: Response[]) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const response = responses.shift();
    if (!response) throw Error('unexpected additional request');
    return response;
  });
  return bodies;
}
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['https://api.openai.com/v1/', 'max_completion_tokens', 'max_tokens'],
  ['https://compatible.example/v1', 'max_tokens', 'max_completion_tokens'],
])('sends exactly one output limit to %s', async (baseUrl, expected, excluded) => {
  const bodies = setup(success());
  await createOpenAiCompatibleClient().complete({ ...request, baseUrl });
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ [expected]: 123, temperature: 0.7, response_format: { type: 'json_object' } });
  expect(bodies[0]).not.toHaveProperty(excluded);
});

it('handles explicit gateway parameter rejections without removing the budget or JSON mode', async () => {
  const bodies = setup(
    rejected('max_tokens', 'unsupported_parameter', "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead."),
    rejected('temperature', 'unsupported_value', 'Only the default (1) value is supported.'),
    success(),
  );
  await expect(createOpenAiCompatibleClient().complete({ ...request, baseUrl: 'https://gateway.example/v1' })).resolves.toMatchObject({ content: '{"ok":true}' });
  expect(bodies).toHaveLength(3);
  expect(bodies[1]).toMatchObject({ max_completion_tokens: 123, temperature: 0.7 });
  expect(bodies[2]).toEqual({ model: request.model, messages: request.messages, response_format: { type: 'json_object' }, max_completion_tokens: 123 });
});

it('returns an unrelated bad request without a second call', async () => {
  const bodies = setup(rejected('response_format', 'invalid_request_error', 'JSON mode not supported'));
  await expect(createOpenAiCompatibleClient().complete(request)).rejects.toMatchObject({ retryable: false, message: expect.stringContaining('JSON mode not supported') });
  expect(bodies).toHaveLength(1);
});

it('identifies a reasoning budget exhausted before visible output', async () => {
  const bodies = setup(Response.json({ choices: [{ finish_reason: 'length', message: { content: '' } }] }));
  await expect(createOpenAiCompatibleClient().complete(request)).rejects.toMatchObject({ retryable: false, message: expect.stringContaining('123 tokens') });
  expect(bodies).toHaveLength(1);
});
