import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  compileGame,
  DEFAULT_SPEECH_MAX_CHARS,
  definePrompts,
  SPEECH_LENGTH_TOLERANCE,
  speechOutput,
  type AiRequest,
} from '../src';
import { DEFAULT_COMMENT_MAX } from '../src/phases/judge';
import { runToEnd, type RunRecord } from '../src/testing';
import { agentWith } from './fixtures/agents';
import { panelSpec } from './fixtures/panelGame';

// 字数只在 speechOutput({ max }) / commentMax 写一次：引擎把它注入为 turn.maxChars，
// 提示词说的数字与输出 schema 的上限来自同一个配置，一起变化。

type PanelPhase = (typeof panelSpec)['phases'][string];
type Pitch = Extract<PanelPhase, { kind: 'speak' }>;
type Review = Extract<PanelPhase, { kind: 'judge' }>;

function pitch(): Pitch {
  const phase = panelSpec.phases.pitch;
  if (phase?.kind !== 'speak') throw new Error('fixture 中 pitch 应为发言阶段');
  return phase;
}

function review(): Review {
  const phase = panelSpec.phases.review;
  if (phase?.kind !== 'judge') throw new Error('fixture 中 review 应为点评阶段');
  return phase;
}

function panelWith(overrides: { readonly pitch?: Pitch; readonly review?: Review; readonly prompts?: typeof panelSpec.prompts }) {
  return compileGame({
    ...panelSpec,
    prompts: overrides.prompts ?? panelSpec.prompts,
    phases: { ...panelSpec.phases, pitch: overrides.pitch ?? pitch(), review: overrides.review ?? review() },
  });
}

function requestsOf(run: RunRecord, action: 'speak' | 'judge'): AiRequest[] {
  const found = run.requests.map(({ request }) => request).filter((request) => request.action === action);
  if (found.length === 0) throw new Error(`没有 ${action} 请求`);
  return found;
}

function maxLengthOf(request: AiRequest, field: 'speech' | 'comment'): number | undefined {
  const properties = request.outputSchema.properties as Readonly<Record<string, { readonly maxLength?: number } | undefined>>;
  return properties[field]?.maxLength;
}

describe('speak length variable', () => {
  it('renders the configured maximum as turn.maxChars and moves it together with the schema limit', () => {
    for (const max of [60, 90]) {
      const run = runToEnd(panelWith({ pitch: { ...pitch(), output: speechOutput({ max }) } }), { seed: 1, playerCount: 3 });
      const [request] = requestsOf(run, 'speak');
      expect(request?.prompt.instruction).toBe(`请发言，不超过 ${max} 字。`);
      expect(maxLengthOf(request as AiRequest, 'speech')).toBe(max * SPEECH_LENGTH_TOLERANCE);
    }
  });

  it('keeps turn.maxChars next to per-turn vars and across retries', () => {
    const themed = definePrompts({ themed: '围绕{{turn.topic}}发言，不超过 {{turn.maxChars}} 字。' }).themed;
    const game = panelWith({
      prompts: { ...panelSpec.prompts, themed },
      pitch: {
        ...pitch(),
        output: speechOutput({ max: 70 }),
        actors: (ctx) => [{ seat: ctx.seats.withRole('speaker').position(1), prompt: themed, vars: { topic: '天气' } }],
      },
    });
    const run = runToEnd(game, {
      seed: 1,
      playerCount: 3,
      agent: agentWith(game, (request) => (request.action === 'speak' && request.attempt === 1 ? { output: { speech: '' } } : undefined)),
    });
    const attempts = requestsOf(run, 'speak');
    expect(attempts.map((request) => request.attempt)).toEqual([1, 2]);
    for (const request of attempts) expect(request.prompt.instruction).toBe('围绕天气发言，不超过 70 字。');
  });

  it('falls back to the default maximum for a custom speech schema', () => {
    const custom = z.object({ speech: z.string().min(1) });
    const run = runToEnd(panelWith({ pitch: { ...pitch(), output: custom } }), { seed: 1, playerCount: 3 });
    expect(requestsOf(run, 'speak')[0]?.prompt.instruction).toBe(`请发言，不超过 ${DEFAULT_SPEECH_MAX_CHARS} 字。`);
  });

  it('rejects a turn that sets maxChars by itself', () => {
    const game = panelWith({
      pitch: { ...pitch(), actors: (ctx) => [{ seat: ctx.seats.withRole('speaker').position(1), vars: { maxChars: 1 } }] },
    });
    expect(() => runToEnd(game, { seed: 1, playerCount: 3 })).toThrow(/maxChars/);
  });
});

describe('judge comment length variable', () => {
  it('renders commentMax as turn.maxChars together with the schema limit, defaulting when unset', () => {
    const { commentMax: _configured, ...unset } = review();
    const cases: readonly (readonly [Review, number])[] = [[{ ...review(), commentMax: 45 }, 45], [unset, DEFAULT_COMMENT_MAX]];
    for (const [phase, expected] of cases) {
      const run = runToEnd(panelWith({ review: phase }), { seed: 1, playerCount: 3 });
      const [request] = requestsOf(run, 'judge');
      expect(request?.prompt.instruction).toBe(`请判定哪位发言人表现更好，点评不超过 ${expected} 字。`);
      expect(maxLengthOf(request as AiRequest, 'comment')).toBe(expected);
    }
  });
});

describe('speechOutput', () => {
  it('rejects a max that is not a positive integer', () => {
    expect(() => speechOutput({ max: 0 })).toThrow(/正整数/);
    expect(() => speechOutput({ max: 1.5 })).toThrow(/正整数/);
  });
});
