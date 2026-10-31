import { definePrompts, type ActDecision, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import { deathCause, noteTally, reassignTally, removeDeath } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { WerewolfState } from '../state';
import { swapTarget } from './magician';

// 种狼：狼队成员，全场一次，可以在狼队击杀后把当晚的被害者感染为狼人（决定写在狼队频道）。
// 被害者当晚确实死于这一刀（没有被女巫救起、没有被守卫守住、没有同时被毒）时感染成功：他不会死亡，
// 改为"感染狼"（狼队成员，失去原有技能），私下得知并在狼队频道告知狼队；否则感染无效，次数照常消耗。

export const wolfSeedPrompts = definePrompts({
  wolfSeed: [
    '你是{{me.label}}，身份是种狼（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '{{#if state.wolfSeedUsed}}你已经用过感染。{{else}}全场一次，你可以在狼队击杀后把当晚的被害者感染为狼人：若他当晚确实被击杀（没有被女巫救起、没有被守卫守住），他不会死亡，而是失去原有技能加入狼队。{{/if}}',
    '白天发言时你可以在发言后宣布自爆。',
  ].join(''),
  infectedWolf: [
    '你是{{me.label}}，被种狼感染后失去了原有技能，现在是感染狼（狼人阵营）。',
    '你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。白天发言时你可以在发言后宣布自爆。',
  ].join(''),
  wolfSeedInfect: '种狼请睁眼。今晚狼队击杀的是 {{#each legalTargets}}{{this}}号{{/each}}。是否发动感染（全场一次）？选择他表示感染，输出空数组表示不感染。',
});

function infectTargets(ctx: WerewolfContext, _seed: Seat): number[] {
  const target = ctx.state.night.wolfTarget;
  return target === null ? [] : [target];
}

function applyInfect(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  if (!decisions.some((decision) => decision.targets.length > 0)) return ctx.state;
  return { ...ctx.state, night: { ...ctx.state.night, infecting: true }, wolfSeedUsed: true };
}

/** 被害者确实死于狼刀时感染成功：移出死亡名单并加入狼队 */
export const wolfSeedInfection: NightStep = (ctx, tally) => {
  const { infecting, wolfTarget } = ctx.state.night;
  if (!infecting || wolfTarget === null) return tally;
  const victim = swapTarget(ctx, wolfTarget);
  if (deathCause(tally, victim) !== 'wolf') return tally;
  return noteTally(
    reassignTally(removeDeath(tally, victim), { seat: victim, role: 'infected_wolf' }),
    { kind: 'narration', text: '你被种狼感染，失去了原有技能，从现在起加入狼队（狼人阵营）。', channel: `private:${victim}` },
    { kind: 'narration', text: `种狼感染成功：${victim}号 没有死亡，加入了狼队。`, channel: 'team:werewolf' },
  );
};

export const wolfSeedPhases = {
  wolf_seed_infect: {
    kind: 'act',
    title: '种狼',
    action: '感染',
    enabled: (ctx) => hasRole(ctx, 'wolf_seed'),
    actors: (ctx) => nightActors(ctx, 'wolf_seed').where(() => !ctx.state.wolfSeedUsed),
    targets: infectTargets,
    allowNone: true,
    prompt: wolfSeedPrompts.wolfSeedInfect,
    channel: () => 'team:werewolf',
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '种狼今晚不发动感染' : `种狼对 ${targets[0]}号 发动感染`),
    apply: applyInfect,
    next: nightAfter('wolf_seed_infect'),
  },
} satisfies WerewolfPhases;
