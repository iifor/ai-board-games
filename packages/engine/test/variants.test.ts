import { describe, expect, it } from 'vitest';
import { compileGame, createSnapshot, EngineInputError, SpecError, type GameSpec } from '../src';
import { makePlayers, runToEnd } from '../src/testing';
import { secretSpec, type SecretState } from './fixtures/secretGame';

type Params = { readonly rounds: number };

function withVariants(overrides: Partial<GameSpec<SecretState, Params>> = {}) {
  return compileGame({
    ...secretSpec,
    variants: {
      classic: { name: '经典', assign: { red: 2, blue: 'rest' } },
      big: { name: '大局', assign: { red: 3, blue: 'rest' }, players: { min: 6, max: 6 }, config: { quiet: true } },
    },
    defaultVariant: 'classic',
    ...overrides,
  });
}

describe('variants', () => {
  const game = withVariants();

  it('uses the default variant and records the key', () => {
    const snapshot = createSnapshot(game, { seed: 1, players: makePlayers(5) });
    expect(snapshot.variantKey).toBe('classic');
    expect(snapshot.seats.filter((seat) => seat.team === 'red')).toHaveLength(2);
  });

  it('applies the chosen variant assignment, player range and config', () => {
    const snapshot = createSnapshot(game, { seed: 1, players: makePlayers(6), variant: 'big' });
    expect(snapshot.seats.filter((seat) => seat.team === 'red')).toHaveLength(3);
    expect(() => createSnapshot(game, { seed: 1, players: makePlayers(5), variant: 'big' })).toThrow(/6-6/);
    expect(() => createSnapshot(game, { seed: 1, players: makePlayers(5), variant: 'nope' })).toThrow(EngineInputError);
  });

  it('exposes the variant to rule contexts', () => {
    const seen: unknown[] = [];
    const probe = withVariants({
      phases: {
        ...secretSpec.phases,
        intro: { kind: 'compute', run: (ctx) => { seen.push(ctx.variant); return {}; }, next: 'red_chat' },
      },
    });
    runToEnd(probe, { seed: 1, playerCount: 6 });
    expect(seen[0]).toEqual({ key: 'classic', name: '经典', config: {} });
  });

  it('rejects variants on games without them and validates assignments', () => {
    const plain = compileGame(secretSpec);
    expect(() => createSnapshot(plain, { seed: 1, players: makePlayers(4), variant: 'classic' })).toThrow(/没有玩法变体/);
    expect(() => withVariants({ defaultVariant: 'missing' })).toThrow(SpecError);
    expect(() => withVariants({ variants: { broken: { name: 'x', assign: { ghost: 2, blue: 'rest' } } }, defaultVariant: 'broken' }))
      .toThrow(/变体 broken 引用了未定义的角色/);
  });
});

describe('disabled phases and reassignment', () => {
  it('skips a disabled phase without logging or counting a visit', () => {
    const game = compileGame({
      ...secretSpec,
      phases: { ...secretSpec.phases, red_chat: { ...(secretSpec.phases.red_chat as object), enabled: () => false } as never },
    });
    const run = runToEnd(game, { seed: 1, playerCount: 4 });
    expect(run.log.some((entry) => entry.phaseId === 'red_chat')).toBe(false);
    expect(run.snapshot.visits.red_chat).toBeUndefined();
    expect(run.snapshot.status).toBe('completed');
  });

  it('changes a seat’s role and team and updates who knows whom', () => {
    const game = compileGame({
      ...secretSpec,
      phases: {
        ...secretSpec.phases,
        intro: {
          kind: 'compute',
          run: (ctx) => ({ reassign: [{ seat: ctx.seats.inTeam('blue').ids()[0] ?? 0, role: 'red' }] }),
          next: 'red_chat',
        },
      },
    });
    const run = runToEnd(game, { seed: 2, playerCount: 5 });
    const reds = run.snapshot.seats.filter((seat) => seat.team === 'red');
    expect(reds).toHaveLength(3);
    const chat = run.requests.filter(({ request }) => request.phaseId === 'red_chat');
    expect(chat).toHaveLength(3);
    expect(chat[0]?.request.prompt.identity.match(/号 玩家/g)?.length).toBe(3);
  });
});
