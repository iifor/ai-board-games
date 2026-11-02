import { definePrompts, type ComputeOutcome } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import { hasRole } from '../rules/board';
import type { WerewolfContext } from '../rules/context';
import { dayAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 老流氓：算作村民，不受狼美人魅惑影响（角色特性 charmImmune）。被女巫毒、被猎人枪击时不会立即出局（特性 delayedDeath）：
// 被毒进入中毒状态（不公布），被枪击进入负伤状态（公布），都在次日白天发言环节结束后出局；
// 当天发言被自爆打断时，在自爆结算后出局。毒药与枪击分别在夜间结算与开枪结算中调用 rules/death.ts 的 woundRogue。

export const oldRoguePrompts = definePrompts({
  oldRogue: '你是{{me.label}}，身份是老流氓（算作村民）。你不受狼美人魅惑的影响；被女巫毒杀或被猎人枪击时不会立即出局，而是在次日白天发言环节结束后出局。',
});

export const ROGUE_DOOM = 'rogue_doom';

/** 今天到期、仍然存活的老流氓 */
function dueRogue(ctx: WerewolfContext): number | null {
  const wound = ctx.state.rogueWound;
  if (wound === null || wound.dueDay > ctx.round || !ctx.seats.get(wound.seat).alive) return null;
  return wound.seat;
}

function resolveDoom(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const seat = dueRogue(ctx);
  const wound = ctx.state.rogueWound;
  if (seat === null || wound === null) return {};
  return {
    state: { ...ctx.state, rogueWound: null },
    eliminate: [{ seat, reason: wound.shot ? '伤重出局' : '发言结束后出局', cause: ROGUE_DOOM }],
  };
}

const oldRoguePhases = {
  old_rogue_doom: {
    kind: 'compute',
    enabled: (ctx) => hasRole(ctx, 'old_rogue'),
    run: resolveDoom,
    next: dayAfter('old_rogue_doom'),
  },
  old_rogue_doom_cut: { kind: 'compute', run: resolveDoom, next: 'return' },
} satisfies WerewolfPhases;

/** 白天发言被自爆打断：到期的老流氓在自爆结算后出局 */
const oldRogueTriggers: WerewolfTriggers = [
  {
    id: 'old-rogue-doom-cut',
    on: 'seat_eliminated',
    when: (ctx, event) => event.kind === 'seat_eliminated' && event.cause === 'self_destruct' && dueRogue(ctx) !== null,
    push: 'old_rogue_doom_cut',
  },
];

export const oldRogueSpecial: SpecialDescriptor = {
  key: 'oldRogue',
  prompts: oldRoguePrompts,
  identities: { old_rogue: oldRoguePrompts.oldRogue },
  phases: oldRoguePhases,
  deathTriggers: oldRogueTriggers,
};
