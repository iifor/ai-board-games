import type { CompiledGame } from '../compiler/compile';
import { formatZodIssues } from '../ai/outputContract';
import { EngineInputError, SpecError } from '../errors';
import type { SetupContext } from '../spec/context';
import { cloneJson, deepFreeze } from '../utils/json';
import { createRng, deriveSeed } from './rng';
import { SeatQuery } from './seats';
import type { CreateMatchInput, EngineSnapshot, Seat, SeatProfile } from './types';
import { resolveVariant, variantContext } from './variants';

type Assignment = Readonly<Record<string, number | 'rest'>>;

function validatePlayers(game: CompiledGame, players: readonly SeatProfile[], range: { min: number; max: number }): void {
  const { min, max } = range;
  if (players.length < min || players.length > max) {
    throw new EngineInputError(`${game.spec.title}需要 ${min}-${max} 名玩家，实际 ${players.length} 名`);
  }
  const ids = new Set(players.map((player) => player.playerId));
  if (ids.size !== players.length) throw new EngineInputError('玩家不能重复');
}

function parseParams(game: CompiledGame, params: unknown): unknown {
  const schema = game.spec.params;
  if (!schema) {
    const empty = params === undefined || (typeof params === 'object' && params !== null && Object.keys(params).length === 0);
    if (!empty) throw new EngineInputError(`${game.spec.title}不接受开局参数`);
    return {};
  }
  const parsed = schema.safeParse(params ?? {});
  if (!parsed.success) throw new EngineInputError(`开局参数不合法：${formatZodIssues(parsed.error)}`);
  return parsed.data;
}

/** 按 assign 的声明顺序展开角色列表，rest 角色承接剩余人数 */
function expandRoles(assign: Assignment, playerCount: number): string[] {
  const entries = Object.entries(assign);
  const fixed = entries.reduce((sum, [, count]) => sum + (count === 'rest' ? 0 : count), 0);
  return entries.flatMap(([role, count]) => Array.from({ length: count === 'rest' ? playerCount - fixed : count }, () => role));
}

function assignSeats(game: CompiledGame, input: CreateMatchInput, assign: Assignment): Seat[] {
  const baseRoles = expandRoles(assign, input.players.length);
  const roles = game.spec.setup.shuffle === false
    ? baseRoles
    : createRng(deriveSeed(input.seed, 'setup:roles')).shuffle(baseRoles);
  const positionCounters = new Map<string, number>();

  return input.players.map((profile, index) => {
    const role = roles[index];
    const roleSpec = role ? game.spec.roles[role] : undefined;
    if (!role || !roleSpec) throw new SpecError(game.spec.key, [`座位 ${index + 1} 没有分配到角色`]);
    const next = (positionCounters.get(role) ?? 0) + 1;
    positionCounters.set(role, next);
    const position = roleSpec.positions !== undefined && next <= roleSpec.positions ? next : null;
    return {
      seat: index + 1,
      profile: { playerId: profile.playerId, name: profile.name, persona: profile.persona, avatar: profile.avatar },
      role,
      team: roleSpec.team,
      position,
      alive: true,
    };
  });
}

/** 创建一局：校验玩家与参数、分配身份、生成初始状态；返回 status 为 created 的快照 */
export function createSnapshot(game: CompiledGame, input: CreateMatchInput): EngineSnapshot {
  if (!Number.isInteger(input.seed)) throw new EngineInputError('seed 必须是整数');
  const variant = resolveVariant(game, input.variant);
  validatePlayers(game, input.players, variant.spec?.players ?? game.spec.players);
  const params = deepFreeze(cloneJson(parseParams(game, input.params)));
  const seats = deepFreeze(assignSeats(game, input, variant.spec?.assign ?? game.spec.setup.assign));
  const setupContext: SetupContext<unknown> = {
    params,
    variant: variantContext(game, variant.key),
    seats: new SeatQuery(seats),
    random: (label: string) => createRng(deriveSeed(input.seed, `setup:${label}`)),
  };
  const initial = game.spec.state.schema.safeParse(game.spec.setup.init(setupContext));
  if (!initial.success) {
    throw new SpecError(game.spec.key, [`setup.init 返回的状态不符合 state.schema：${formatZodIssues(initial.error)}`]);
  }

  const snapshot: EngineSnapshot = {
    engineVersion: 1,
    gameKey: game.spec.key,
    specVersion: game.spec.version,
    specHash: game.hash,
    variantKey: variant.key,
    seed: input.seed >>> 0,
    params,
    status: 'created',
    seats,
    state: initial.data,
    round: 1,
    cursor: { phaseId: game.spec.start, entered: false, visit: 0, phaseState: null },
    visits: {},
    results: {},
    stack: [],
    triggerQueue: [],
    activeTrigger: null,
    jump: null,
    gameOverTriggered: false,
    rolesRevealed: false,
    log: [],
    pending: [],
    budgetUsed: { aiRequests: 0 },
    result: null,
    debug: input.debug
      ? { breakpoints: input.debug.breakpoints ?? game.spec.debug?.breakpoints ?? [], mode: 'breakpoints', passKey: null }
      : null,
  };
  return cloneJson(snapshot);
}
