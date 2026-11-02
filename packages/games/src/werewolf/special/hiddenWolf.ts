import { definePrompts, type ActDecision, type ComputeOutcome, type Seat } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import { boardConfig, hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import { isPackWolf, type WerewolfContext } from '../rules/context';
import { withinMark } from '../rules/nightEffects';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 隐狼：离群的狼人（lone_wolf 阵营），狼队不认识他（狼刀可以选他），不在狼队频道里，不能自爆，查验时被视为好人。
// 板子参数 hiddenWolf 决定口径：
// - inherit（隐狼&乌鸦）：开局由法官私下告知狼同伴（state.knownWolves）；狼同伴全部出局后继承击杀权，每晚单独击杀（即当晚的狼刀）。
// - linked（驯熊师&隐狼）：与狼人互不相认、不能击杀；狼队最后一名狼人出局时隐狼随之出局。

const hiddenWolfPrompts = definePrompts({
  hiddenWolf: [
    '你是{{me.label}}，身份是隐狼（离群的狼人，狼人阵营），不能自爆，查验时被视为好人。',
    '{{#if state.knownWolves}}法官告诉你，你的狼同伴是 {{#each state.knownWolves}}{{this}}号 {{/each}}；他们不知道你是谁，你也不和他们一起夜聊、击杀。',
    '狼同伴全部出局后，你继承击杀权，每晚单独击杀一名玩家。',
    '{{else}}你和狼人互不相认，你不能参与击杀；狼人全部出局时你也会随之出局。{{/if}}',
  ].join(''),
  hiddenWolfKill: '隐狼请睁眼。你的狼同伴已全部出局，由你继承击杀权：选择今晚要击杀的玩家，也可以输出空数组不杀人。',
  /** 火力全开的隐狼（hidden_wolf_pack）：狼队成员，白狼王出局前查验为好人（特性 appearsGoodWhile） */
  hiddenWolfPack: [
    '你是{{me.label}}，身份是隐狼（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '你与狼队互相认识、一起夜聊与击杀；白狼王出局前，查验会把你视为好人，之后视为狼人。你不能自爆。',
  ].join(''),
});

export const WOLVES_GONE = 'wolves_gone';

function packAlive(ctx: WerewolfContext): boolean {
  return ctx.seats.alive().where(isPackWolf).count() > 0;
}

function inherits(ctx: WerewolfContext): boolean {
  return hasRole(ctx, 'hidden_wolf') && boardConfig(ctx).hiddenWolf === 'inherit';
}

function killTargets(ctx: WerewolfContext, wolf: Seat): number[] {
  return ctx.seats.alive().except(wolf).where((seat) => withinMark(ctx, seat.seat)).ids();
}

/** 继承的击杀就是当晚的狼刀：女巫照常得知刀口，守护、解药照常生效 */
function applyKill(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const target = decisions.flatMap((decision) => decision.targets)[0];
  return target === undefined ? ctx.state : { ...ctx.state, night: { ...ctx.state.night, wolfTarget: target } };
}

/**
 * linked 口径下狼队已全部出局、隐狼还活着：他马上会随之出局（hidden_wolf_link），
 * 胜负判定在此期间暂缓，避免按隐狼单独的票数误判狼人胜利。
 */
function hiddenWolfDoomed(ctx: WerewolfContext): boolean {
  return boardConfig(ctx).hiddenWolf === 'linked' && !packAlive(ctx) && ctx.seats.alive().withRole('hidden_wolf').count() > 0;
}

function resolveLink(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  if (packAlive(ctx)) return {};
  return {
    eliminate: ctx.seats.alive().withRole('hidden_wolf').ids().map((seat) => ({ seat, reason: '随狼队出局', cause: WOLVES_GONE })),
  };
}

const hiddenWolfPhases = {
  hidden_wolf_kill: {
    kind: 'act',
    title: '隐狼',
    action: '击杀',
    enabled: inherits,
    actors: (ctx) => nightActors(ctx, 'hidden_wolf').where(() => !packAlive(ctx)),
    targets: killTargets,
    allowNone: true,
    prompt: hiddenWolfPrompts.hiddenWolfKill,
    describe: (_ctx, _seat, targets) => (targets.length ? `击杀 ${targets[0]}号` : '今晚不杀人'),
    apply: applyKill,
    next: nightAfter('hidden_wolf_kill'),
  },
  hidden_wolf_link: { kind: 'compute', run: resolveLink, next: 'return' },
} satisfies WerewolfPhases;

const hiddenWolfTriggers: WerewolfTriggers = [
  {
    id: 'hidden-wolf-link',
    on: 'seat_eliminated',
    when: (ctx, event) => event.kind === 'seat_eliminated' && isPackWolf(ctx.seats.get(event.seat)) && hiddenWolfDoomed(ctx),
    push: 'hidden_wolf_link',
  },
];

export const hiddenWolfSpecial: SpecialDescriptor = {
  key: 'hiddenWolf',
  prompts: hiddenWolfPrompts,
  identities: { hidden_wolf: hiddenWolfPrompts.hiddenWolf, hidden_wolf_pack: hiddenWolfPrompts.hiddenWolfPack },
  phases: hiddenWolfPhases,
  deathTriggers: hiddenWolfTriggers,
  victory: { defer: hiddenWolfDoomed },
};
