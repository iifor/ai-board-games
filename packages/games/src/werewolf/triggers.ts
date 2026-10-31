import type { TriggerSpec } from '@battle/engine';
import { anonymousShots, canHunterShoot, hasLastWords, isSheriffDeath } from './rules/death';
import { specialDeathTriggers } from './special';
import type { WerewolfParams, WerewolfState } from './state';

/**
 * 每名出局者依次处理：遗言 → 猎人开枪 → 特殊角色的出局技能 → 移交警徽（声明顺序即执行顺序）。
 * 有狼王的板子里猎人改走中性的"开枪"阶段（见 special/wolfKing.ts）。
 */
export const werewolfTriggers: readonly TriggerSpec<WerewolfState, WerewolfParams>[] = [
  { id: 'last-words', on: 'seat_eliminated', when: hasLastWords, push: 'last_words' },
  { id: 'hunter-shot', on: 'seat_eliminated', when: (ctx, event) => !anonymousShots(ctx) && canHunterShoot(ctx, event), push: 'hunter_shot' },
  ...specialDeathTriggers,
  { id: 'badge-transfer', on: 'seat_eliminated', when: isSheriffDeath, push: 'badge_transfer' },
  {
    id: 'self-destruct',
    on: 'action_declared',
    when: (_ctx, event) => event.kind === 'action_declared' && event.action === 'selfDestruct',
    jump: 'self_destruct',
  },
];
