import { definePrompts } from '@battle/engine';
import { checksAsWolf } from '../rules/appearance';
import { hasRole } from '../rules/board';
import { isBlocked } from '../rules/block';
import { nearestNeighbors } from '../rules/context';
import type { DawnStep } from '../rules/types';

// 熊（动物园）：神职。每天天亮公布死讯时判定：熊左右两侧最近的存活玩家（已扣除昨晚的死者）中有狼人（查验视为好人的狼除外）
// 则法官宣布"熊咆哮了"；熊已出局（包括昨晚死亡）或昨晚被企鹅冰冻时不咆哮。与驯熊师（入夜前判定）不同。

export const bearPrompts = definePrompts({
  bear: '你是{{me.label}}，身份是熊（神职）。每天天亮时，如果你左右两侧最近的存活玩家中有狼人，法官会宣布"熊咆哮了"；你出局后、或前一晚被企鹅冰冻时熊不咆哮。',
});

export const bearDawnRoar: DawnStep = (ctx, draft) => {
  if (!hasRole(ctx, 'bear')) return draft;
  const survives = (seat: number): boolean => ctx.seats.get(seat).alive && !draft.deaths.some((death) => death.seat === seat);
  const bear = ctx.seats.withRole('bear').ids()[0];
  const roars = bear !== undefined && survives(bear) && !isBlocked(ctx, bear)
    && nearestNeighbors(ctx, bear, survives).some((seat) => checksAsWolf(ctx, ctx.seats.get(seat)));
  return { ...draft, notes: [...draft.notes, roars ? '熊咆哮了。' : '熊没有咆哮。'] };
};
