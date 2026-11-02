import { definePrompts, type ComputeOutcome, type TriggerEvent } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import type { WerewolfContext } from '../rules/context';
import { isDreamed, swapTarget } from '../rules/nightEffects';
import { deathCause, noteTally, removeDeath } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { WerewolfState } from '../state';
import { WHITE_WOLF_KING_BLAST } from './whiteWolfKing';
import type { SpecialDescriptor } from './types';

// 大树（长老）：民牌，要被狼人刀中两次才会出局——第一次狼刀落下时只失去一条命（私下告知）；
// 女巫对还有两条命的大树用解药，解药作废，大树照样失去一条命；守卫守住则没有被刀中。
// 大树因狼刀或白狼王自爆带人以外的原因出局时，法官公开宣布其余神职全部失去技能（state.godsDisabled，见 rules/block.ts 的 skillsLost）。

export const bigTreePrompts = definePrompts({
  bigTree: [
    '你是{{me.label}}，身份是大树（长老，算作村民）。你要被狼人刀中两次才会出局{{#if state.bigTreeHits}}，你已经被刀中过一次，再被刀中就会出局{{/if}}。',
    '女巫对还有两条命的你使用解药时，解药作废，你只剩一条命。你若因狼刀或白狼王自爆以外的原因出局，其余神职将全部失去技能。',
  ].join(''),
});

const TREE = 'big_tree';

/** 狼刀被女巫的解药挡下（没有被守住、不是梦游者）：对还有两条命的大树而言解药作废 */
function antidoteSpent(ctx: WerewolfContext, tree: number): boolean {
  const { wolfTarget, saved, guarded } = ctx.state.night;
  if (wolfTarget === null || !saved || swapTarget(ctx, wolfTarget) !== tree) return false;
  return (guarded === null || swapTarget(ctx, guarded) !== tree) && !isDreamed(ctx, tree);
}

/** 狼刀落在还有两条命的大树身上：不死，失去一条命 */
const bigTreeShield: NightStep = (ctx, tally) => {
  const tree = ctx.seats.alive().withRole(TREE).ids()[0];
  if (tree === undefined || tally.state.bigTreeHits > 0) return tally;
  const struck = deathCause(tally, tree) === 'wolf';
  if (!struck && !antidoteSpent(ctx, tree)) return tally;
  const spared = struck ? removeDeath(tally, tree) : tally;
  return noteTally(
    { ...spared, state: { ...spared.state, bigTreeHits: 1 } },
    { kind: 'narration', text: '你今晚被狼人刀中，失去了一条命，还剩一条命。', channel: `private:${tree}` },
  );
};

/** 大树因狼刀或白狼王自爆带人以外的原因出局 */
function fallsBadly(ctx: WerewolfContext, event: TriggerEvent): boolean {
  if (event.kind !== 'seat_eliminated' || ctx.state.godsDisabled || ctx.seats.get(event.seat).role !== TREE) return false;
  return event.cause !== 'wolf' && event.cause !== WHITE_WOLF_KING_BLAST;
}

function disableGods(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  return {
    state: { ...ctx.state, godsDisabled: true },
    log: [{ kind: 'narration', text: '大树倒下了：从现在起，其余神职全部失去技能。' }],
  };
}

const bigTreePhases = {
  big_tree_fall: { kind: 'compute', title: '大树倒下', run: disableGods, next: 'return' },
} satisfies WerewolfPhases;

const bigTreeTriggers: WerewolfTriggers = [
  { id: 'big-tree-fall', on: 'seat_eliminated', when: fallsBadly, push: 'big_tree_fall' },
];

export const bigTreeSpecial: SpecialDescriptor = {
  key: 'bigTree',
  prompts: bigTreePrompts,
  identities: { big_tree: bigTreePrompts.bigTree },
  phases: bigTreePhases,
  deathTriggers: bigTreeTriggers,
  nightStep: bigTreeShield,
};
