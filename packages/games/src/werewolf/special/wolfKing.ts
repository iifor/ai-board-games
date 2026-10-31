import { definePrompts, type TriggerEvent, type TriggerSpec } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import type { WerewolfContext } from '../rules/context';
import {
  anonymousShots,
  canHunterShoot,
  describeShot,
  NO_SHOT_CAUSES,
  recordShot,
  resolveShot,
  triggerSeat,
} from '../rules/death';
import type { WerewolfParams, WerewolfState } from '../state';

// 狼王：狼人阵营，被放逐、被猎人枪杀、被狼人误刀（如魔术师换号后）出局时可以开枪带走一名玩家；
// 被毒杀、摄梦而死、自爆、殉情、被炸死时不能开枪。有狼王的板子里猎人与狼王开枪都不翻牌：
// 两者共用标题中性的"开枪"阶段（death_shot），播报与出局原因都不说明开枪者身份。

export const wolfKingPrompts = definePrompts({
  wolfKing: [
    '你是{{me.label}}，身份是狼王（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '你被放逐、被猎人枪杀或被狼人误刀出局时可以开枪带走一名玩家；被女巫毒杀、因摄梦死亡或自爆时不能开枪。开枪时不翻牌，其他人分不清开枪的是猎人还是狼王。',
    '白天发言时你可以在发言后宣布自爆（自爆时不能开枪）。',
  ].join(''),
  deathShot: '你已出局，可以开枪带走一名存活玩家，也可以输出空数组放弃开枪。',
});

/** 狼王不能开枪的出局原因：猎人不能开枪的原因（NO_SHOT_CAUSES）之外，还有摄梦而死与自爆 */
const WOLF_KING_EXTRA_NO_SHOT: ReadonlySet<string> = new Set(['dream', 'self_destruct']);

export function canWolfKingShoot(ctx: WerewolfContext, event: TriggerEvent): boolean {
  if (event.kind !== 'seat_eliminated' || ctx.seats.get(event.seat).role !== 'wolf_king') return false;
  // 模块之间有循环引用（规则 → 角色目录 → 本模块），NO_SHOT_CAUSES 只能在运行时读取
  return !NO_SHOT_CAUSES.has(event.cause) && !WOLF_KING_EXTRA_NO_SHOT.has(event.cause);
}

export const wolfKingPhases = {
  death_shot: {
    kind: 'act',
    title: '开枪',
    action: '开枪',
    actors: triggerSeat,
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: wolfKingPrompts.deathShot,
    channel: () => 'public',
    describe: describeShot,
    apply: recordShot,
    next: 'death_shot_resolve',
  },
  death_shot_resolve: { kind: 'compute', run: resolveShot, next: 'return' },
} satisfies WerewolfPhases;

export const wolfKingTriggers: readonly TriggerSpec<WerewolfState, WerewolfParams>[] = [
  {
    id: 'death-shot',
    on: 'seat_eliminated',
    when: (ctx, event) => anonymousShots(ctx) && (canHunterShoot(ctx, event) || canWolfKingShoot(ctx, event)),
    push: 'death_shot',
  },
];
