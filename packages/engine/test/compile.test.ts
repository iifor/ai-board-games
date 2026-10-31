import { describe, expect, it } from 'vitest';
import { compileGame, definePrompts, SpecError } from '../src';
import { computeSpecHash } from '../src/compiler/specHash';
import { counterSpec, minimalPrompts } from './fixtures/minimal';

function issuesOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof SpecError) return error.issues;
    throw error;
  }
  throw new Error('期望抛出 SpecError');
}

describe('compileGame', () => {
  it('accepts a valid spec and produces a stable hash', () => {
    const game = compileGame(counterSpec());
    expect(game.hash).toBe(compileGame(counterSpec()).hash);
    expect(game.hash).not.toBe(compileGame(counterSpec(3, { budget: { maxRounds: 9 } })).hash);
    expect(game.hash).not.toBe(compileGame(counterSpec(3, { version: 2 })).hash);
    expect(game.prompts.get('hello')).toBe(minimalPrompts.hello);
  });

  it('reports dangling, unreachable and unconditional-last issues', () => {
    const base = counterSpec();
    const issues = issuesOf(() => compileGame({
      ...base,
      phases: {
        ...base.phases,
        hello: { kind: 'announce', text: minimalPrompts.hello, next: 'missing' },
        orphan: { kind: 'announce', text: minimalPrompts.hello, next: [{ when: () => true, goto: 'end' }] },
      },
    }));
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('不存在的阶段 "missing"'),
      expect.stringContaining('最后一项必须无条件'),
      expect.stringContaining('不可达'),
    ]));
  });

  it('reports role assignment problems', () => {
    expect(issuesOf(() => compileGame(counterSpec(3, { setup: { assign: { player: 3 }, init: () => ({ ticks: 0 }) } }))))
      .toEqual([expect.stringContaining('固定人数 3')]);
    expect(issuesOf(() => compileGame(counterSpec(3, { setup: { assign: { ghost: 2 }, init: () => ({ ticks: 0 }) } }))))
      .toEqual(expect.arrayContaining([expect.stringContaining('未定义的角色：ghost')]));
  });

  it('reports unregistered templates and invalid template variables', () => {
    const extra = definePrompts({ loose: '{{unknown.value}}', leaky: '{{state.hidden}}' });
    const issues = issuesOf(() => compileGame(counterSpec(3, {
      prompts: { ...minimalPrompts, ...extra },
      phases: {
        hello: { kind: 'announce', text: definePrompts({ hello: 'x' }).hello, next: 'tick' },
        tick: counterSpec().phases.tick as never,
      },
    })));
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('未登记'),
      expect.stringContaining('{{unknown.value}}'),
      expect.stringContaining('state.hidden'),
    ]));
  });

  it('hashes function bodies and template sources', () => {
    expect(computeSpecHash({ f: () => 1 })).not.toBe(computeSpecHash({ f: () => 2 }));
    expect(computeSpecHash({ t: minimalPrompts.hello })).toBe(computeSpecHash({ t: minimalPrompts.hello }));
  });
});
