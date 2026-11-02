import { definePrompts, type ComputeOutcome, type TriggerEvent } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import type { WerewolfContext } from '../rules/context';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 树苗（火力全开）：平民，没有技能。所有树苗都出局时，大树（长老）随之出局——
// 这是大树因狼刀与白狼王自爆以外的原因出局，因此其余神职随即失去技能（见 bigTree.ts）。

const saplingPrompts = definePrompts({
  sapling: '你是{{me.label}}，身份是树苗（平民）。你没有特殊技能，需要通过发言和投票找出狼人；所有树苗都出局时，大树也会随之倒下。',
});

const SAPLING = 'sapling';
const TREE = 'big_tree';
/** 树苗全部出局，大树随之出局 */
export const SAPLINGS_GONE = 'saplings_gone';

/** 最后一棵树苗刚刚出局，大树还活着 */
function lastSaplingFell(ctx: WerewolfContext, event: TriggerEvent): boolean {
  if (event.kind !== 'seat_eliminated' || ctx.seats.get(event.seat).role !== SAPLING) return false;
  return ctx.seats.alive().withRole(SAPLING).count() === 0 && ctx.seats.alive().withRole(TREE).count() > 0;
}

function treeFalls(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  // 排队的触发器可能先让大树出局，结算时只处理仍存活的大树
  if (ctx.seats.alive().withRole(SAPLING).count() > 0) return {};
  return {
    eliminate: ctx.seats.alive().withRole(TREE).ids().map((seat) => ({ seat, reason: '树苗全部出局，大树随之倒下', cause: SAPLINGS_GONE })),
  };
}

const saplingPhases = {
  sapling_tree_fall: { kind: 'compute', run: treeFalls, next: 'return' },
} satisfies WerewolfPhases;

const saplingTriggers: WerewolfTriggers = [
  { id: 'sapling-tree-fall', on: 'seat_eliminated', when: lastSaplingFell, push: 'sapling_tree_fall' },
];

export const saplingSpecial: SpecialDescriptor = {
  key: 'sapling',
  prompts: saplingPrompts,
  identities: { sapling: saplingPrompts.sapling },
  phases: saplingPhases,
  deathTriggers: saplingTriggers,
};
