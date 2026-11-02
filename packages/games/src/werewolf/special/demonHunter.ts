import { definePrompts, type ActDecision } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import { isWolf, type WerewolfContext } from '../rules/context';
import { swapTarget } from '../rules/nightEffects';
import { nightAfter } from '../rules/order';
import { addDeath } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 猎魔人：神职，从第二夜起每晚可以狩猎一名其他存活玩家（可以不狩猎）。对方属于狼人阵营则对方当晚死亡，
// 否则猎魔人自己当晚死亡（原因 hunt，守护、解药都挡不下，女巫不会被告知）。免疫女巫的毒药（角色特性 poisonImmune）。
// 判断用的是真实阵营而不是查验结果：狩猎不是查验。

const demonHunterPrompts = definePrompts({
  demonHunter: [
    '你是{{me.label}}，身份是猎魔人（神职）。从第二夜起，你每晚可以狩猎一名玩家：他是狼人则他出局，他是好人则你自己出局。',
    '你免疫女巫的毒药。',
  ].join(''),
  demonHunterHunt: '猎魔人请睁眼，选择今晚要狩猎的玩家（是狼人则他出局，是好人则你出局），也可以输出空数组不狩猎。',
});

const DEMON_HUNTER = 'demon_hunter';

function applyHunt(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const hunted = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, hunted } };
}

/** 狩猎结算：狼人阵营的猎物死亡，否则猎魔人死亡；猎魔人当晚另有死因时狩猎照常生效。魔术师换号后按实际落点 */
const demonHunt: NightStep = (ctx, tally) => {
  const { hunted } = ctx.state.night;
  const hunter = ctx.seats.alive().withRole(DEMON_HUNTER).ids()[0];
  if (hunted === null || hunter === undefined) return tally;
  const prey = swapTarget(ctx, hunted);
  return addDeath(tally, isWolf(ctx.seats.get(prey)) ? prey : hunter, 'hunt');
};

const demonHunterPhases = {
  demon_hunter_hunt: {
    kind: 'act',
    title: '猎魔人狩猎',
    action: '狩猎',
    enabled: (ctx) => hasRole(ctx, DEMON_HUNTER) && ctx.round >= 2,
    actors: (ctx) => nightActors(ctx, DEMON_HUNTER),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: demonHunterPrompts.demonHunterHunt,
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '今晚不狩猎' : `狩猎 ${targets[0]}号`),
    apply: applyHunt,
    next: nightAfter('demon_hunter_hunt'),
  },
} satisfies WerewolfPhases;

export const demonHunterSpecial: SpecialDescriptor = {
  key: 'demonHunter',
  prompts: demonHunterPrompts,
  identities: { demon_hunter: demonHunterPrompts.demonHunter },
  phases: demonHunterPhases,
  nightStep: demonHunt,
};
