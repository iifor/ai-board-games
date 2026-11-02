import { SPEECH_LENGTH_TOLERANCE, type AiRequest, type CompiledGame } from '@battle/engine';
import { runToEnd } from '@battle/engine/testing';
import { describe, expect, it } from 'vitest';
import { GAMES } from '../src';

// 字数只在各阶段的 speechOutput({ max }) / commentMax 配置一次，模板用 {{turn.maxChars}} 引用。
// 守住两件事：模板里不再手写数字；跑一局，每条发言与点评请求的提示词说的数字都与输出 schema 的上限一致。

const MAX_CHARS_TAG = '{{turn.maxChars}}';

function hardLimit(request: AiRequest, field: 'speech' | 'comment'): number {
  const properties = request.outputSchema.properties as Readonly<Record<string, { readonly maxLength?: number } | undefined>> | undefined;
  const maxLength = properties?.[field]?.maxLength;
  if (maxLength === undefined) throw new Error(`${request.id} 的输出 schema 没有 ${field}.maxLength`);
  return maxLength;
}

/** 提示词应当告诉模型的数字：发言是 schema 硬上限除以容差，点评就是硬上限 */
function statedLimit(request: AiRequest): number {
  return request.action === 'speak' ? hardLimit(request, 'speech') / SPEECH_LENGTH_TOLERANCE : hardLimit(request, 'comment');
}

describe.each(GAMES.map((game): [string, CompiledGame] => [game.spec.key, game]))('%s prompt length limits', (_key, game) => {
  it('never hardcodes a character count in templates', () => {
    for (const template of game.prompts.values()) expect(template.source, template.name).not.toMatch(/\d+\s*字/);
  });

  it('lets every speak and judge phase read turn.maxChars', () => {
    for (const [id, phase] of Object.entries(game.spec.phases)) {
      if (phase.kind !== 'speak' && phase.kind !== 'judge') continue;
      expect(phase.prompt.source, id).toContain(MAX_CHARS_TAG);
    }
  });

  it('states the same limit as the output schema in every speech and judgement request', () => {
    const run = runToEnd(game, { seed: 1, maxAdvances: 2000 });
    const requests = run.requests.map(({ request }) => request).filter((request) => request.action === 'speak' || request.action === 'judge');
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) expect(request.prompt.instruction, request.id).toContain(`不超过 ${statedLimit(request)} 字`);
  });
});
