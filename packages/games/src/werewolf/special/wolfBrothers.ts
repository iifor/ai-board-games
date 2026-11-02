import { definePrompts, type ActDecision, type ComputeOutcome, type Seat, type TriggerSpec } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { isDreamed, swapTarget, withinMark } from '../rules/nightEffects';
import { nightAfter } from '../rules/order';
import { addDeath } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { WerewolfParams, WerewolfState } from '../state';

// 狼兄弟：狼兄是狼队成员；狼弟是离群的狼（lone_wolf），只与狼兄互相认识（特性 pairedWith，写入 state.knownWolves），
// 狼队其他人不认识他（狼刀可以选中他），狼兄出局前预言家查验他为好人（特性 appearsGoodWhile）。
// 狼兄出局后的下一晚，狼弟在狼队击杀之后单独击杀一名玩家（可以不杀；守护、解药挡不下）；
// 再之后一晚的狼人行动前，狼弟改为狼队成员（wolf_younger_brother_pack），与狼队互相认识、一起夜聊与击杀。

export const wolfBrothersPrompts = definePrompts({
  wolfElderBrother: [
    '你是{{me.label}}，身份是狼兄（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '{{#if state.knownWolves}}你的弟弟狼弟是 {{#each state.knownWolves}}{{this}}号 {{/each}}：他不和狼队一起夜聊、击杀，狼队其他人不认识他，你出局前预言家查验他为好人。{{/if}}',
    '你出局后的下一晚，狼弟可以单独击杀一名玩家；再之后一晚，他会加入狼队。白天发言时你可以在发言后宣布自爆。',
  ].join(''),
  wolfYoungerBrother: [
    '你是{{me.label}}，身份是狼弟（狼人阵营）。{{#if state.knownWolves}}你的哥哥狼兄是 {{#each state.knownWolves}}{{this}}号 {{/each}}。{{/if}}',
    '你暂时不和狼队一起夜聊、击杀，也不认识其他狼人；狼兄出局前预言家查验你为好人。',
    '狼兄出局后的下一晚你可以单独击杀一名玩家，再之后一晚你会加入狼队。白天发言时你可以在发言后宣布自爆。',
  ].join(''),
  wolfYoungerBrotherPack: [
    '你是{{me.label}}，身份是狼弟（狼人阵营）。狼兄已经出局，你已加入狼队。',
    '你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。白天发言时你可以在发言后宣布自爆。',
  ].join(''),
  youngerBrotherKill: '狼弟请睁眼。狼兄已经出局，今晚你可以单独击杀一名玩家，也可以输出空数组不杀人。',
});

const ELDER = 'wolf_elder_brother';
const YOUNGER = 'wolf_younger_brother';

function recordFall(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  return ctx.state.elderFellOn === null ? { state: { ...ctx.state, elderFellOn: ctx.round } } : {};
}

/** 狼兄出局后的下一晚：狼弟可以单独击杀 */
function killNight(ctx: WerewolfContext): boolean {
  return ctx.state.elderFellOn !== null && ctx.round === ctx.state.elderFellOn + 1;
}

/** 狼弟不认识狼队，合法目标不能把狼人排除在外（否则会暴露狼队）：除自己与认识的狼兄外的存活玩家 */
function killTargets(ctx: WerewolfContext, younger: Seat): number[] {
  const known = ctx.state.knownWolves[String(younger.seat)] ?? [];
  return ctx.seats.alive().except(younger, ...known).where((seat) => withinMark(ctx, seat.seat)).ids();
}

function applyKill(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const brotherTarget = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, brotherTarget } };
}

/** 狼弟的单独击杀：守护、解药都挡不下；受魔术师换号、梦游影响 */
export const brotherKill: NightStep = (ctx, tally) => {
  const { brotherTarget } = ctx.state.night;
  if (brotherTarget === null) return tally;
  const victim = swapTarget(ctx, brotherTarget);
  return isDreamed(ctx, victim) ? tally : addDeath(tally, victim, 'wolf');
};

/** 狼兄出局后的第二晚，狼弟加入狼队 */
function join(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const younger = ctx.seats.alive().withRole(YOUNGER).ids()[0];
  const fell = ctx.state.elderFellOn;
  if (younger === undefined || fell === null || ctx.round < fell + 2) return {};
  return {
    reassign: [{ seat: younger, role: 'wolf_younger_brother_pack' }],
    log: [
      { kind: 'narration', text: '你已加入狼队，从今晚起与狼队互相认识、一起夜聊与击杀。', channel: `private:${younger}` },
      { kind: 'narration', text: `狼弟 ${younger}号 加入了狼队，从今晚起一起夜聊与击杀。`, channel: 'team:werewolf' },
    ],
  };
}

export const wolfBrothersPhases = {
  wolf_brother_mourn: { kind: 'compute', run: recordFall, next: 'return' },
  younger_brother_join: {
    kind: 'compute',
    enabled: (ctx) => hasRole(ctx, YOUNGER),
    run: join,
    next: nightAfter('younger_brother_join'),
  },
  younger_brother_kill: {
    kind: 'act',
    action: '单独击杀',
    enabled: (ctx) => hasRole(ctx, YOUNGER),
    actors: (ctx) => nightActors(ctx, YOUNGER).where(() => killNight(ctx)),
    targets: killTargets,
    allowNone: true,
    prompt: wolfBrothersPrompts.youngerBrotherKill,
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '今晚不单独击杀' : `单独击杀 ${targets[0]}号`),
    apply: applyKill,
    next: nightAfter('younger_brother_kill'),
  },
} satisfies WerewolfPhases;

export const wolfBrothersTriggers: readonly TriggerSpec<WerewolfState, WerewolfParams>[] = [
  {
    id: 'wolf-elder-fall',
    on: 'seat_eliminated',
    when: (ctx, event) => event.kind === 'seat_eliminated' && ctx.seats.get(event.seat).role === ELDER,
    push: 'wolf_brother_mourn',
  },
];
